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
  ConsultFactData,
  MAX_TASKS_FOR_DERIVATION,
  MAX_DOCUMENTS_FOR_DERIVATION,
  CONSULT_LOOKBACK_DAYS,
} from "./types.ts";

// Re-export constants for use
export const TASK_LIMIT = 200;
export const DOC_LIMIT = 100;
export const CONSULT_DAYS = 30;

export interface RetrievedData {
  tenant: TenantFactData | null;
  packages: PackageFactData[];
  phases: PhaseFactData[];
  tasks: TaskFactData[];
  evidence: EvidenceFactData[];
  consults: ConsultFactData[];
  tables_queried: string[];
  record_ids: { table: string; ids: string[] }[];
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
  }

  // 2. Fetch packages from package_instances (source of truth), then look up template names
  let packages: PackageFactData[] = [];
  tablesQueried.push("package_instances");
  const { data: instancesData } = await supabase
    .from("package_instances")
    .select("id, package_id, is_complete, start_date, end_date, created_at")
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
    return {
      id: inst.id,
      name: pkg.name ?? "Unknown package",
      status: inst.is_complete ? "closed" : "active",
      package_type: pkg.package_type ?? null,
      total_hours: pkg.total_hours ?? null,
      updated_at: inst.created_at,
    };
  });

  if (packages.length > 0) {
    recordIds.push({ table: "package_instances", ids: packages.map(p => p.id.toString()) });
  }

  // 3. Fetch phases (stages)
  let phases: PhaseFactData[] = [];
  const stageIdsToFetch = scope.phase_id
    ? [parseInt(scope.phase_id, 10)]
    : (tenant?.stage_ids || []);

  if (stageIdsToFetch.length > 0) {
    tablesQueried.push("stages");
    const { data: stagesData } = await supabase
      .from("stages")
      .select("id, name, status, stage_type, updated_at")
      .in("id", stageIdsToFetch)
      .limit(30);

    phases = (stagesData || []).map((s) => ({
      id: s.id,
      title: s.name,
      status: s.status || "unknown",
      stage_type: s.stage_type,
      updated_at: s.updated_at,
    }));

    if (phases.length > 0) {
      recordIds.push({ table: "stages", ids: phases.map(p => p.id.toString()) });
    }
  }

  // 4. Fetch tasks (limit to MAX_TASKS_FOR_DERIVATION)
  tablesQueried.push("tasks");
  const { data: tasksData } = await supabase
    .from("tasks")
    .select("id, task_name, status, priority, due_date_at, updated_at")
    .eq("tenant_id", tenantId)
    .limit(TASK_LIMIT);

  const tasks: TaskFactData[] = (tasksData || []).map((t) => ({
    id: t.id,
    task_name: t.task_name,
    status: t.status,
    priority: t.priority,
    due_date: t.due_date_at,
    updated_at: t.updated_at,
  }));

  if (tasks.length > 0) {
    recordIds.push({ table: "tasks", ids: tasks.map(t => t.id) });
  }

  // 5. Fetch evidence/documents (tenant-scoped, limit to MAX_DOCUMENTS_FOR_DERIVATION)
  tablesQueried.push("documents");
  const { data: docsData } = await supabase
    .from("documents")
    .select("id, title, category, is_released, due_date, updated_at")
    .eq("tenant_id", tenantId)
    .limit(DOC_LIMIT);

  const evidence: EvidenceFactData[] = (docsData || []).map((d) => ({
    id: d.id,
    title: d.title,
    category: d.category,
    is_released: d.is_released || false,
    expiry_date: d.due_date,
    updated_at: d.updated_at,
  }));

  if (evidence.length > 0) {
    recordIds.push({ table: "documents", ids: evidence.map(e => e.id.toString()) });
  }

  // 6. Fetch consult logs (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - CONSULT_DAYS);
  const lookbackDate = thirtyDaysAgo.toISOString().split("T")[0];

  tablesQueried.push("consult_logs");
  const { data: consultData } = await supabase
    .from("consult_logs")
    .select("consult_id, date, hours, task, consultant")
    .eq("tenant_id", tenantId)
    .gte("date", lookbackDate)
    .limit(100);

  const consults: ConsultFactData[] = (consultData || []).map((c) => ({
    id: c.consult_id,
    date: c.date,
    hours: parseFloat(c.hours) || 0,
    task: c.task,
    consultant: c.consultant,
  }));

  if (consults.length > 0) {
    recordIds.push({ table: "consult_logs", ids: consults.map(c => c.id) });
  }

  return {
    tenant,
    packages,
    phases,
    tasks,
    evidence,
    consults,
    tables_queried: tablesQueried,
    record_ids: recordIds,
  };
}
