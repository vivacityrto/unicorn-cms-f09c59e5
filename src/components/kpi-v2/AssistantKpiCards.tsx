import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { KpiGaugeCard } from "./KpiGaugeCard";
import { getPeriodRange, type KpiV2Period } from "./types";
import { pctStatus } from "@/lib/kpi-v2/status";

interface Props {
  subjectUuid: string;
  period: KpiV2Period;
}

/**
 * AssistantKpiCards — single Tasks gauge for admin assistants.
 * Sourced from v_kpi_cst_summary.tasks_total/tasks_on_time.
 */
export function AssistantKpiCards({ subjectUuid, period }: Props) {
  const [loading, setLoading] = useState(true);
  const [tasksPct, setTasksPct] = useState<number | null>(null);
  const [tasksTotal, setTasksTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!subjectUuid) return;
    setLoading(true);
    (async () => {
      const { startIso, endIso } = getPeriodRange(period);
      const { data } = await (supabase as any)
        .from("v_kpi_cst_summary")
        .select("tasks_total,tasks_on_time")
        .eq("subject_uuid", subjectUuid)
        .gte("period_start", startIso)
        .lte("period_start", endIso);
      if (cancelled) return;
      const rows = (data ?? []) as Array<{ tasks_total: number; tasks_on_time: number }>;
      const total = rows.reduce((s, r) => s + (r.tasks_total ?? 0), 0);
      const onTime = rows.reduce((s, r) => s + (r.tasks_on_time ?? 0), 0);
      setTasksTotal(total);
      setTasksPct(total > 0 ? (onTime / total) * 100 : null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [subjectUuid, period]);

  const primary = tasksPct == null ? "—" : `${tasksPct.toFixed(0)}%`;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="md:col-start-2">
        <KpiGaugeCard
          label="Tasks"
          description="Assigned tasks completed on or before their due date."
          value={tasksPct}
          primary={primary}
          secondary={tasksTotal > 0 ? `of ${tasksTotal}` : undefined}
          target="Target: 80%"
          status={pctStatus(tasksPct, 80, 70)}
          loading={loading}
        />
      </div>
    </div>
  );
}
