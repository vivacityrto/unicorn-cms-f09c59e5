import { supabase } from "@/integrations/supabase/client";
import { getPeriodRange, type KpiV2Period } from "@/components/kpi-v2/types";

const SLA_SECONDS = 12 * 60 * 60;

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

function tsRange(period: KpiV2Period) {
  const { startIso, endIso } = getPeriodRange(period);
  return {
    startIso,
    endIso,
    startTs: `${startIso}T00:00:00.000Z`,
    endTs: `${endIso}T23:59:59.999Z`,
  };
}

/** CSC — Retention. */
export async function fetchRetention(
  subjectUuid: string,
  period: KpiV2Period,
): Promise<RetentionResult> {
  const { startTs, endTs } = tsRange(period);
  const sb = supabase as any;
  const { data } = await sb
    .from("tenants")
    .select("id, churned_at, created_at")
    .eq("assigned_consultant_user_id", subjectUuid);
  const rows = (data ?? []) as Array<{ id: number; churned_at: string | null; created_at: string }>;
  const atStart = rows.filter((r) => r.created_at <= endTs);
  const churned = atStart.filter(
    (r) => r.churned_at != null && r.churned_at >= startTs && r.churned_at <= endTs,
  );
  const total = atStart.length;
  const ch = churned.length;
  const retained = total - ch;
  return { total, churned: ch, pct: total > 0 ? (retained / total) * 100 : null };
}

/** CSC — Communication (12-hr SLA on client messages). */
export async function fetchCommunication(
  subjectUuid: string,
  period: KpiV2Period,
): Promise<CommunicationResult> {
  const { startTs, endTs } = tsRange(period);
  const sb = supabase as any;
  const { data: tenantRows } = await sb
    .from("tenants")
    .select("id")
    .eq("assigned_consultant_user_id", subjectUuid)
    .eq("status", "active");
  const tenantIds = Array.from(
    new Set((tenantRows ?? []).map((a: any) => a.id).filter(Boolean)),
  );
  if (tenantIds.length === 0) return { total: 0, met: 0, pct: null };

  const { data: clientMsgs } = await sb
    .from("tenant_messages")
    .select("id, conversation_id, created_at")
    .in("tenant_id", tenantIds)
    .eq("sender_type", "client")
    .gte("created_at", startTs)
    .lte("created_at", endTs)
    .limit(500);
  const cMsgs = (clientMsgs ?? []) as Array<{ id: string; conversation_id: string; created_at: string }>;
  if (cMsgs.length === 0) return { total: 0, met: 0, pct: null };

  const convIds = Array.from(new Set(cMsgs.map((m) => m.conversation_id).filter(Boolean)));
  const bufferEnd = new Date(new Date(endTs).getTime() + SLA_SECONDS * 1000).toISOString();
  const { data: staffMsgs } = await sb
    .from("tenant_messages")
    .select("conversation_id, created_at")
    .in("conversation_id", convIds)
    .eq("sender_type", "staff")
    .gte("created_at", startTs)
    .lte("created_at", bufferEnd);
  const sByConv = new Map<string, string[]>();
  (staffMsgs ?? []).forEach((s: any) => {
    const arr = sByConv.get(s.conversation_id) ?? [];
    arr.push(s.created_at);
    sByConv.set(s.conversation_id, arr);
  });

  let total = 0;
  let met = 0;
  cMsgs.forEach((m) => {
    const staffTimes = sByConv.get(m.conversation_id) ?? [];
    const clientTs = new Date(m.created_at).getTime();
    const reply = staffTimes
      .map((t) => new Date(t).getTime())
      .filter((t) => t > clientTs)
      .sort((a, b) => a - b)[0];
    if (reply == null) return;
    total += 1;
    if ((reply - clientTs) / 1000 <= SLA_SECONDS) met += 1;
  });
  return { total, met, pct: total > 0 ? (met / total) * 100 : null };
}

/** CSC — Package tasks completed on time. */
export async function fetchCscTasks(
  subjectUuid: string,
  period: KpiV2Period,
): Promise<TaskResult> {
  const { startTs, endTs } = tsRange(period);
  const sb = supabase as any;
  const { data } = await sb
    .from("client_team_tasks")
    .select(
      "id, status, created_at, client_package_stages!inner(client_packages!inner(assigned_csc_user_id))",
    )
    .eq("client_package_stages.client_packages.assigned_csc_user_id", subjectUuid)
    .gte("created_at", startTs)
    .lte("created_at", endTs);
  const rows = (data ?? []) as Array<{ status: string | null }>;
  const total = rows.length;
  const completed = rows.filter((r) => (r.status ?? "").toLowerCase() === "completed").length;
  return { total, completed, pct: total > 0 ? (completed / total) * 100 : null };
}

/** Assistant — union tasks across three tables, on-time completion. */
export async function fetchAssistantTasks(
  subjectUuid: string,
  period: KpiV2Period,
): Promise<TaskResult> {
  const { startTs, endTs } = tsRange(period);
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
  const completed = dueRows.filter((r) => {
    if (!r.completed_at) return false;
    if (r.isTs) return new Date(r.completed_at).getTime() <= new Date(r.due).getTime();
    return (r.completed_at as string).slice(0, 10) <= r.due;
  }).length;
  return { total, completed, pct: total > 0 ? (completed / total) * 100 : null };
}
