/**
 * Data Retrieval Layer
 *
 * Deterministic queries with strict tenant filtering.
 * Returns typed data for fact derivation.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type {
  TenantFactData,
  PackageFactData,
  PhaseFactData,
  TaskFactData,
  EvidenceFactData,
  ActionItemFactData,
  TimeFactData,
  MAX_TASKS_FOR_DERIVATION,
  MAX_DOCUMENTS_FOR_DERIVATION,
  CONSULT_LOOKBACK_DAYS,
} from "./types.ts";

// Re-export constants for use
export const TASK_LIMIT = 200;
export const DOC_LIMIT = 100;
export const CONSULT_DAYS = 30;
export const ACTION_ITEM_LIMIT = 100;
export const TIME_ENTRY_LIMIT = 200;

export interface RetrievedData {
  tenant: TenantFactData | null;
  packages: PackageFactData[];
  phases: PhaseFactData[];
  tasks: TaskFactData[];
  evidence: EvidenceFactData[];
  actionItems: ActionItemFactData[];
  timeEntries: TimeFactData[];
  tables_queried: string[];
  record_ids: { table: string; ids: string[] }[];
  // Keyed `${table}:${id}` — real display names for record links, built
  // from names already fetched here rather than re-queried in record-links.ts.
  labels: Map<string, string>;
}

/**
 * Retrieve all data needed for fact building.
 * All queries are tenant-scoped.
 */
export async function retrieveFactData(
  supabase: SupabaseClient,
  tenantId: number,
  scope: {
    client_id: string | null;
    package_id: string | null;
    phase_id: string | null;
  }
): Promise<RetrievedData> {
  const tablesQueried: string[] = [];
  const recordIds: { table: string; ids: string[] }[] = [];
  const labels = new Map<string, string>();

  // 1. Fetch tenant data
  tablesQueried.push("tenants");
  const { data: tenantData } = await supabase
    .from("tenants")
    .select("id, name, status, rto_id, cricos_id, risk_level, package_ids, stage_ids, updated_at")
    .eq("id", tenantId)
    .single();

  const tenant: TenantFactData | null = tenantData ? {
    id: tenantData.id,
    name: tenantData.name,
    status: tenantData.status || "unknown",
    rto_id: tenantData.rto_id,
    cricos_id: tenantData.cricos_id,
    risk_level: tenantData.risk_level,
    package_ids: tenantData.package_ids || [],
    stage_ids: tenantData.stage_ids || [],
    updated_at: tenantData.updated_at,
  } : null;

  if (tenant) {
    recordIds.push({ table: "tenants", ids: [tenant.id.toString()] });
    labels.set(`tenants:${tenant.id}`, tenant.name);
  }

  // 2. Fetch packages from package_instances (source of truth), then look up
  // template names + hours. Per-instance hours_included/hours_added/hours_used
  // are the billing source of truth — prefer them over the packages template's
  // static total_hours, which is only a fallback default.
  let packages: PackageFactData[] = [];
  tablesQueried.push("package_instances");
  const { data: instancesData } = await supabase
    .from("package_instances")
    .select("id, package_id, is_complete, hours_included, hours_added, hours_used, is_unlimited_override, start_date, created_at")
    .eq("tenant_id", tenantId)
    .eq("is_complete", false)
    .limit(20);

  const packageIds = [...new Set((instancesData || []).map((i: any) => i.package_id))];
  const { data: packagesData } = packageIds.length > 0
    ? await supabase
        .from("packages")
        .select("id, name, package_type, total_hours")
        .in("id", packageIds)
    : { data: [] };
  const packageMap = new Map((packagesData || []).map((p: any) => [p.id, p]));

  packages = (instancesData || []).map((inst: any) => {
    const pkg: any = packageMap.get(inst.package_id) ?? {};
    const instanceTotal = (inst.hours_included ?? 0) + (inst.hours_added ?? 0);
    const name = pkg.name ?? "Unknown package";
    labels.set(`package_instances:${inst.id}`, name);
    return {
      id: inst.id,
      name,
      status: inst.is_complete ? "closed" : "active",
      package_type: pkg.package_type ?? null,
      // Prefer the instance's own granted-hours counters; fall back to the
      // template's static total_hours only when the instance has neither
      // hours_included nor hours_added set (e.g. an unlimited/legacy package).
      total_hours: instanceTotal > 0 ? instanceTotal : (pkg.total_hours ?? null),
      used_hours: inst.hours_used ?? null,
      updated_at: inst.created_at,
    };
  });

  if (packages.length > 0) {
    recordIds.push({ table: "package_instances", ids: packages.map(p => p.id.toString()) });
  }

  // 3. Fetch phases — client_package_stage_state is the real per-client
  // progress table (tenant_id, status, due_at, blocked_reason, waiting_reason);
  // `stages` is a global stage TEMPLATE registry with no tenant_id at all and
  // must never be read as if its `status` were a client's progress.
  let phases: PhaseFactData[] = [];
  tablesQueried.push("client_package_stage_state");
  let stageStateQuery = supabase
    .from("client_package_stage_state")
    .select("id, stage_id, package_id, status, due_at, blocked_reason, waiting_reason, updated_at")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true })
    .limit(60);
  if (scope.phase_id) {
    stageStateQuery = stageStateQuery.eq("stage_id", parseInt(scope.phase_id, 10));
  } else if (scope.package_id) {
    stageStateQuery = stageStateQuery.eq("package_id", parseInt(scope.package_id, 10));
  }
  const { data: stageStateData } = await stageStateQuery;

  const stageTemplateIds = [...new Set((stageStateData || []).map((s: any) => s.stage_id))];
  const { data: stageDefsData } = stageTemplateIds.length > 0
    ? await supabase.from("stages").select("id, name, stage_type").in("id", stageTemplateIds)
    : { data: [] };
  const stageDefMap = new Map((stageDefsData || []).map((s: any) => [s.id, s]));

  phases = (stageStateData || []).map((s: any) => {
    const def: any = stageDefMap.get(s.stage_id) ?? {};
    const title = def.name ?? `Stage ${s.stage_id}`;
    // Key labels by stage_id (not the client_package_stage_state row id) —
    // see the recordIds note below for why.
    labels.set(`client_package_stage_state:${s.stage_id}`, title);
    return {
      id: s.stage_id,
      title,
      status: s.status,
      stage_type: def.stage_type ?? null,
      due_date: s.due_at,
      blocked_reason: s.blocked_reason,
      waiting_reason: s.waiting_reason,
      package_id: s.package_id,
      updated_at: s.updated_at,
    };
  });

  if (stageStateData && stageStateData.length > 0) {
    // Use stage_id here, not the client_package_stage_state row id. An
    // earlier version of this fix used the row id for record-link precision,
    // but that put record links in a different ID space than
    // PhaseFactData.id / scope.phase_id / inferScope everywhere else,
    // producing links that pointed at the wrong identifier entirely
    // (caught by review). Consistency of the ID space wins over per-row
    // audit precision for this one table.
    recordIds.push({
      table: "client_package_stage_state",
      ids: [...new Set((stageStateData as any[]).map((s: any) => s.stage_id.toString()))],
    });
  }

  // 4. Fetch tasks from tasks_tenants — the real per-client task table.
  // (`tasks` is a raw ClickUp mirror with NO tenant_id column at all; it was
  // being read here previously with no tenant filter, returning up to 200
  // arbitrary rows unrelated to the client being asked about.)
  tablesQueried.push("tasks_tenants");
  let taskQuery = supabase
    .from("tasks_tenants")
    .select("id, task_name, status, completed, priority, due_date, escalated_at, package_id, stage_id, updated_at")
    .eq("tenant_id", tenantId)
    .order("due_date", { ascending: true })
    .limit(TASK_LIMIT);
  if (scope.package_id) {
    taskQuery = taskQuery.eq("package_id", parseInt(scope.package_id, 10));
  }
  if (scope.phase_id) {
    taskQuery = taskQuery.eq("stage_id", parseInt(scope.phase_id, 10));
  }
  const { data: tasksData } = await taskQuery;

  const tasks: TaskFactData[] = (tasksData || []).map((t: any) => {
    labels.set(`tasks_tenants:${t.id}`, t.task_name);
    return {
      id: t.id,
      task_name: t.task_name,
      status: t.status,
      completed: !!t.completed,
      priority: t.priority,
      due_date: t.due_date,
      escalated_at: t.escalated_at,
      package_id: t.package_id,
      stage_id: t.stage_id,
      updated_at: t.updated_at,
    };
  });

  if (tasks.length > 0) {
    recordIds.push({ table: "tasks_tenants", ids: tasks.map(t => t.id) });
  }

  // 5. Fetch action items from client_action_items — the CSC/client-facing
  // action-item workboard (distinct from tasks_tenants' ClickUp-synced
  // operational tasks and from client_audit_actions' audit remediation
  // items). item_type='client' items are client-portal-visible; 'internal'
  // items are staff-only.
  let actionItems: ActionItemFactData[] = [];
  tablesQueried.push("client_action_items");
  let actionItemQuery = supabase
    .from("client_action_items")
    .select("id, title, status, priority, item_type, due_date, completed_at, package_id, stage_id")
    .eq("tenant_id", tenantId)
    .order("due_date", { ascending: true })
    .limit(ACTION_ITEM_LIMIT);
  if (scope.package_id) {
    actionItemQuery = actionItemQuery.eq("package_id", parseInt(scope.package_id, 10));
  }
  const { data: actionItemsData } = await actionItemQuery;

  actionItems = (actionItemsData || []).map((a: any) => {
    labels.set(`client_action_items:${a.id}`, a.title);
    return {
      id: a.id,
      title: a.title,
      status: a.status,
      priority: a.priority,
      item_type: a.item_type,
      due_date: a.due_date,
      completed_at: a.completed_at,
      package_id: a.package_id,
      stage_id: a.stage_id,
    };
  });

  if (actionItems.length > 0) {
    recordIds.push({ table: "client_action_items", ids: actionItems.map(a => a.id) });
  }

  // 6. Fetch evidence/documents (tenant-scoped, limit to MAX_DOCUMENTS_FOR_DERIVATION)
  tablesQueried.push("documents");
  const { data: docsData } = await supabase
    .from("documents")
    .select("id, title, category, is_released, due_date, updated_at")
    .eq("tenant_id", tenantId)
    .limit(DOC_LIMIT);

  const evidence: EvidenceFactData[] = (docsData || []).map((d) => {
    labels.set(`documents:${d.id}`, d.title);
    return {
      id: d.id,
      title: d.title,
      category: d.category,
      is_released: d.is_released || false,
      expiry_date: d.due_date,
      updated_at: d.updated_at,
    };
  });

  if (evidence.length > 0) {
    recordIds.push({ table: "documents", ids: evidence.map(e => e.id.toString()) });
  }

  // 7. Fetch time entries (last 30 days) — time_entries is the real, actively
  // populated ledger CSCs log time into via Calendar Time Capture / Time
  // Inbox. (The previous consult_logs source is a legacy import table that is
  // completely empty in production — confirmed 0 rows — so there is no
  // historical data to preserve behind a cutover date; this is a straight
  // replacement, not an addition alongside it.) `client_id` is the correct
  // join key for "which RTO client tenant" (time_entries also carries a
  // `tenant_id`, the owning/Vivacity side — confirmed identical to client_id
  // in all 1257 current rows, but client_id is the semantically correct one).
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - CONSULT_DAYS);

  tablesQueried.push("time_entries");
  let timeQuery = supabase
    .from("time_entries")
    .select("id, start_at, duration_minutes, work_type, is_billable, notes, package_id, stage_id")
    .eq("client_id", tenantId)
    .gte("start_at", thirtyDaysAgo.toISOString())
    .order("start_at", { ascending: false })
    .limit(TIME_ENTRY_LIMIT);
  if (scope.package_id) {
    timeQuery = timeQuery.eq("package_id", parseInt(scope.package_id, 10));
  }
  const { data: timeData } = await timeQuery;

  const timeEntries: TimeFactData[] = (timeData || []).map((t: any) => ({
    id: t.id,
    start_at: t.start_at,
    duration_minutes: t.duration_minutes ?? 0,
    work_type: t.work_type,
    is_billable: !!t.is_billable,
    notes: t.notes,
  }));

  if (timeEntries.length > 0) {
    recordIds.push({ table: "time_entries", ids: timeEntries.map(t => t.id) });
  }

  return {
    tenant,
    packages,
    phases,
    tasks,
    evidence,
    actionItems,
    timeEntries,
    tables_queried: tablesQueried,
    record_ids: recordIds,
    labels,
  };
}
