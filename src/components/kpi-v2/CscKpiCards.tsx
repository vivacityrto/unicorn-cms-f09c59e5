import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { KpiGaugeCard, type KpiStatus } from "./KpiGaugeCard";
import type { KpiV2Period } from "./types";

const PERIOD_DAYS: Record<KpiV2Period, number> = { weekly: 7, monthly: 30, quarterly: 92 };

function pctStatus(pct: number | null, on: number, risk: number): KpiStatus {
  if (pct == null) return "none";
  if (pct >= on) return "on";
  if (pct >= risk) return "risk";
  return "below";
}

interface Props {
  subjectUuid: string;
  period: KpiV2Period;
}

/**
 * CscKpiCards — three donut-gauge cards for CSC consultants:
 *  - Retention: retained clients / total clients (data-driven when available)
 *  - Communication: emails answered within SLA
 *  - Tasks: tasks completed on time
 * Metrics that have no view backing yet render as "No data" — the gauge and
 * status pill both reflect the missing state without breaking layout.
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
      const since = new Date();
      since.setDate(since.getDate() - PERIOD_DAYS[period]);
      const sinceIso = since.toISOString().slice(0, 10);

      const [emailRes, tasksRes] = await Promise.all([
        (supabase as any)
          .from("v_kpi_csc_summary")
          .select("email_total,email_sla_met")
          .eq("subject_uuid", subjectUuid)
          .gte("period_start", sinceIso),
        (supabase as any)
          .from("v_kpi_cst_summary")
          .select("tasks_total,tasks_on_time")
          .eq("subject_uuid", subjectUuid)
          .gte("period_start", sinceIso),
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
          target="Target: 90%"
          status="none"
          loading={false}
          footer="Coming soon"
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
          target="Target: 80%"
          status={pctStatus(tasksPct, 80, 70)}
          loading={loading}
        />
      </div>
    ),
    [emailPct, emailPrimary, emailTotal, tasksPct, tasksPrimary, tasksTotal, loading],
  );
}
