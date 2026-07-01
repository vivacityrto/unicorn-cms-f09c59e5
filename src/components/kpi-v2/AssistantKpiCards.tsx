import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { KpiGaugeCard } from "./KpiGaugeCard";
import { getPeriodRange, type KpiV2Period } from "./types";
import { pctStatus } from "@/lib/kpi-v2/status";
import { KpiDrillDownSheet } from "./KpiDrillDownSheet";

interface Props {
  subjectUuid: string;
  period: KpiV2Period;
}

/**
 * AssistantKpiCards — Tasks gauge unioned across tasks_tenants,
 * client_action_items and ops_work_items. Target: 85%.
 */
export function AssistantKpiCards({ subjectUuid, period }: Props) {
  const [loading, setLoading] = useState(true);
  const [tasksPct, setTasksPct] = useState<number | null>(null);
  const [tasksTotal, setTasksTotal] = useState(0);
  const [tasksOnTime, setTasksOnTime] = useState(0);
  const [drillOpen, setDrillOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!subjectUuid) return;
    setLoading(true);
    (async () => {
      const { startIso, endIso } = getPeriodRange(period);
      const startTs = `${startIso}T00:00:00.000Z`;
      const endTs = `${endIso}T23:59:59.999Z`;
      const sb = supabase as any;

      const [ttCreated, ttFollowers, cai, ops] = await Promise.all([
        sb.from("tasks_tenants")
          .select("id, due_date, completed_at")
          .gte("created_at", startTs).lte("created_at", endTs)
          .eq("created_by", subjectUuid),
        sb.from("tasks_tenants")
          .select("id, due_date, completed_at")
          .gte("created_at", startTs).lte("created_at", endTs)
          .contains("followers", [subjectUuid]),
        sb.from("client_action_items")
          .select("id, due_date, completed_at")
          .gte("created_at", startTs).lte("created_at", endTs)
          .eq("assignee_user_id", subjectUuid),
        sb.from("ops_work_items")
          .select("id, due_at, completed_at")
          .gte("created_at", startTs).lte("created_at", endTs)
          .eq("owner_user_uuid", subjectUuid),
      ]);

      const seen = new Set<string>();
      const dueRows: Array<{ due: string; completed_at: string | null; isTs: boolean }> = [];

      const pushDate = (id: string, due: string | null, completed_at: string | null) => {
        if (!due || seen.has(`tt:${id}`)) return;
        seen.add(`tt:${id}`);
        dueRows.push({ due, completed_at, isTs: false });
      };
      (ttCreated.data ?? []).forEach((r: any) => pushDate(r.id, r.due_date, r.completed_at));
      (ttFollowers.data ?? []).forEach((r: any) => pushDate(r.id, r.due_date, r.completed_at));
      (cai.data ?? []).forEach((r: any) => {
        if (!r.due_date) return;
        dueRows.push({ due: r.due_date, completed_at: r.completed_at, isTs: false });
      });
      (ops.data ?? []).forEach((r: any) => {
        if (!r.due_at) return;
        dueRows.push({ due: r.due_at, completed_at: r.completed_at, isTs: true });
      });

      const total = dueRows.length;
      const onTime = dueRows.filter((r) => {
        if (!r.completed_at) return false;
        if (r.isTs) return new Date(r.completed_at).getTime() <= new Date(r.due).getTime();
        return (r.completed_at as string).slice(0, 10) <= r.due;
      }).length;

      if (cancelled) return;
      setTasksTotal(total);
      setTasksOnTime(onTime);
      setTasksPct(total > 0 ? (onTime / total) * 100 : null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [subjectUuid, period]);

  const primary = tasksPct == null ? "—" : `${tasksPct.toFixed(0)}%`;

  const metricText =
    tasksTotal > 0
      ? `${primary} · ${tasksOnTime} of ${tasksTotal} tasks completed on time`
      : "No tasks recorded for this period.";

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-start-2">
          <KpiGaugeCard
            label="Tasks"
            description="Assigned tasks completed on or before their due date."
            value={tasksPct}
            primary={primary}
            secondary={tasksTotal > 0 ? `of ${tasksTotal}` : undefined}
            target="Target: 85%"
            status={pctStatus(tasksPct, 85, 75)}
            loading={loading}
            onClick={() => setDrillOpen(true)}
          />
        </div>
      </div>

      <KpiDrillDownSheet
        open={drillOpen}
        onOpenChange={setDrillOpen}
        kind="assistant_tasks"
        subjectUuid={subjectUuid}
        period={period}
        metricText={metricText}
        label="Tasks"
      />
    </>
  );
}
