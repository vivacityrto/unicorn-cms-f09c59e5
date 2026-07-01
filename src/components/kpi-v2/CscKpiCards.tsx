import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { KpiGaugeCard } from "./KpiGaugeCard";
import { getPeriodRange, type KpiV2Period } from "./types";
import { pctStatus, retentionStatus } from "@/lib/kpi-v2/status";

interface Props {
  subjectUuid: string;
  period: KpiV2Period;
}

/**
 * CscKpiCards — three donut-gauge cards for CSC consultants:
 *  - Retention: retained clients / total clients (target 100%, ≥90% at risk)
 *  - Communication: emails answered within SLA (target 80%)
 *  - Tasks: tasks completed on time (target 90%)
 */
export function CscKpiCards({ subjectUuid, period }: Props) {
  const [loading, setLoading] = useState(true);
  const [emailPct, setEmailPct] = useState<number | null>(null);
  const [emailTotal, setEmailTotal] = useState(0);
  const [tasksPct, setTasksPct] = useState<number | null>(null);
  const [tasksTotal, setTasksTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!subjectUuid) return;
    setLoading(true);
    (async () => {
      const { startIso, endIso } = getPeriodRange(period);

      const [emailRes, tasksRes] = await Promise.all([
        (supabase as any)
          .from("v_kpi_csc_summary")
          .select("email_total,email_sla_met")
          .eq("subject_uuid", subjectUuid)
          .gte("period_start", startIso)
          .lte("period_start", endIso),
        (supabase as any)
          .from("v_kpi_cst_summary")
          .select("tasks_total,tasks_on_time")
          .eq("subject_uuid", subjectUuid)
          .gte("period_start", startIso)
          .lte("period_start", endIso),
      ]);

      if (cancelled) return;

      const emailRows = (emailRes?.data ?? []) as Array<{ email_total: number; email_sla_met: number }>;
      const eTotal = emailRows.reduce((s, r) => s + (r.email_total ?? 0), 0);
      const eMet = emailRows.reduce((s, r) => s + (r.email_sla_met ?? 0), 0);
      setEmailTotal(eTotal);
      setEmailPct(eTotal > 0 ? (eMet / eTotal) * 100 : null);

      const taskRows = (tasksRes?.data ?? []) as Array<{ tasks_total: number; tasks_on_time: number }>;
      const tTotal = taskRows.reduce((s, r) => s + (r.tasks_total ?? 0), 0);
      const tOnTime = taskRows.reduce((s, r) => s + (r.tasks_on_time ?? 0), 0);
      setTasksTotal(tTotal);
      setTasksPct(tTotal > 0 ? (tOnTime / tTotal) * 100 : null);

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [subjectUuid, period]);

  const emailPrimary = emailPct == null ? "—" : `${emailPct.toFixed(0)}%`;
  const tasksPrimary = tasksPct == null ? "—" : `${tasksPct.toFixed(0)}%`;

  return useMemo(
    () => (
      <div className="grid gap-4 md:grid-cols-3">
        <KpiGaugeCard
          label="Retention"
          description="Clients retained over the selected period."
          value={null}
          primary="—"
          target="Target: 100%"
          status={retentionStatus(null)}
          loading={false}
        />
        <KpiGaugeCard
          label="Communication"
          description="Client emails answered within the 12-hour SLA."
          value={emailPct}
          primary={emailPrimary}
          secondary={emailTotal > 0 ? `of ${emailTotal}` : undefined}
          target="Target: 80%"
          status={pctStatus(emailPct, 80, 72)}
          loading={loading}
        />
        <KpiGaugeCard
          label="Tasks"
          description="Assigned tasks completed on or before their due date."
          value={tasksPct}
          primary={tasksPrimary}
          secondary={tasksTotal > 0 ? `of ${tasksTotal}` : undefined}
          target="Target: 90%"
          status={pctStatus(tasksPct, 90, 80)}
          loading={loading}
        />
      </div>
    ),
    [emailPct, emailPrimary, emailTotal, tasksPct, tasksPrimary, tasksTotal, loading],
  );
}
