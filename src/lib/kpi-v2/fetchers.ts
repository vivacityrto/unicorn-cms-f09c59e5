import { supabase } from "@/integrations/supabase/client";
import { getPeriodRange, type KpiV2Period } from "@/components/kpi-v2/types";

export interface RetentionResult {
  total: number;
  churned: number;
  pct: number | null;
}
export interface CommunicationResult {
  total: number;
  met: number;
  pct: number | null;
}
export interface TaskResult {
  total: number;
  completed: number;
  pct: number | null;
}

/**
 * Half-open [p_start, p_end) window matching the KPI RPCs.
 * `endTs` is the start of the day *after* the period ends, so the RPCs'
 * `< p_end` predicate captures the full final day.
 */
function tsRange(period: KpiV2Period) {
  const { startIso, endIso } = getPeriodRange(period);
  const startTs = `${startIso}T00:00:00.000Z`;
  const endDate = new Date(`${endIso}T00:00:00.000Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  const endTs = endDate.toISOString();
  return { startTs, endTs };
}

/** CSC — Retention (clients on my books during the period). */
export async function fetchRetention(
  subjectUuid: string,
  period: KpiV2Period,
): Promise<RetentionResult> {
  const { startTs, endTs } = tsRange(period);
  const { data, error } = await supabase.rpc("kpi_csc_retention_rows", {
    p_csc_user_id: subjectUuid,
    p_start: startTs,
    p_end: endTs,
  });
  if (error) {
    console.error("[fetchRetention] rpc failed", error);
    return { total: 0, churned: 0, pct: null };
  }
  const rows = (data ?? []) as Array<{ churned_in_period: boolean }>;
  const total = rows.length;
  const ch = rows.filter((r) => r.churned_in_period).length;
  const retained = total - ch;
  return { total, churned: ch, pct: total > 0 ? (retained / total) * 100 : null };
}

/** CSC — Communication (12-hr SLA, point-in-time attribution). */
export async function fetchCommunication(
  subjectUuid: string,
  period: KpiV2Period,
): Promise<CommunicationResult> {
  const { startTs, endTs } = tsRange(period);
  const { data, error } = await supabase.rpc("kpi_csc_communication_rows", {
    p_csc_user_id: subjectUuid,
    p_start: startTs,
    p_end: endTs,
  });
  if (error) {
    console.error("[fetchCommunication] rpc failed", error);
    return { total: 0, met: 0, pct: null };
  }
  const rows = (data ?? []) as Array<{ sla_status: "met" | "missed" | "pending" }>;
  // Pending rows (still inside 12-hr window with no reply) are excluded.
  const decided = rows.filter((r) => r.sla_status !== "pending");
  const total = decided.length;
  const met = decided.filter((r) => r.sla_status === "met").length;
  return { total, met, pct: total > 0 ? (met / total) * 100 : null };
}

/** CSC — Package tasks (point-in-time attribution). */
export async function fetchCscTasks(
  subjectUuid: string,
  period: KpiV2Period,
): Promise<TaskResult> {
  const { startTs, endTs } = tsRange(period);
  const { data, error } = await supabase.rpc("kpi_csc_tasks_rows", {
    p_csc_user_id: subjectUuid,
    p_start: startTs,
    p_end: endTs,
  });
  if (error) {
    console.error("[fetchCscTasks] rpc failed", error);
    return { total: 0, completed: 0, pct: null };
  }
  const rows = (data ?? []) as Array<{ status: string | null }>;
  const total = rows.length;
  const completed = rows.filter((r) => (r.status ?? "").toLowerCase() === "completed").length;
  return { total, completed, pct: total > 0 ? (completed / total) * 100 : null };
}

/** Assistant — union tasks across three tables, on-time completion. Unchanged. */
export async function fetchAssistantTasks(
  subjectUuid: string,
  period: KpiV2Period,
): Promise<TaskResult> {
  const { startTs, endTs } = tsRange(period);

  const [ttCreated, ttFollowers, cai, ops] = await Promise.all([
    supabase.from("tasks_tenants")
      .select("id, due_date, completed_at")
      .gte("created_at", startTs).lt("created_at", endTs)
      .eq("created_by", subjectUuid),
    supabase.from("tasks_tenants")
      .select("id, due_date, completed_at")
      .gte("created_at", startTs).lt("created_at", endTs)
      .contains("followers", [subjectUuid]),
    supabase.from("client_action_items")
      .select("id, due_date, completed_at")
      .gte("created_at", startTs).lt("created_at", endTs)
      .eq("assignee_user_id", subjectUuid),
    supabase.from("ops_work_items")
      .select("id, due_at, completed_at")
      .gte("created_at", startTs).lt("created_at", endTs)
      .eq("owner_user_uuid", subjectUuid),
  ]);

  const seen = new Set<string>();
  const dueRows: Array<{ due: string; completed_at: string | null; isTs: boolean }> = [];
  const pushDate = (id: string, due: string | null, completed_at: string | null) => {
    if (!due || seen.has(`tt:${id}`)) return;
    seen.add(`tt:${id}`);
    dueRows.push({ due, completed_at, isTs: false });
  };
  (ttCreated.data ?? []).forEach((r) => pushDate(r.id, r.due_date, r.completed_at));
  (ttFollowers.data ?? []).forEach((r) => pushDate(r.id, r.due_date, r.completed_at));
  (cai.data ?? []).forEach((r) => {
    if (!r.due_date) return;
    dueRows.push({ due: r.due_date, completed_at: r.completed_at, isTs: false });
  });
  (ops.data ?? []).forEach((r) => {
    if (!r.due_at) return;
    dueRows.push({ due: r.due_at, completed_at: r.completed_at, isTs: true });
  });

  const total = dueRows.length;
  const completed = dueRows.filter((r) => {
    if (!r.completed_at) return false;
    if (r.isTs) return new Date(r.completed_at).getTime() <= new Date(r.due).getTime();
    return (r.completed_at as string).slice(0, 10) <= r.due;
  }).length;
  return { total, completed, pct: total > 0 ? (completed / total) * 100 : null };
}
