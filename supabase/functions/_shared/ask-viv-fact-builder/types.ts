/**
 * Ask Viv Fact Builder Types
 * 
 * Canonical types for the deterministic fact builder service.
 * All facts are derived, traceable, and audit-safe.
 */

// ============= Inputs =============

export interface AskVivFactBuilderInput {
  user_id: string;          // auth.uid()
  tenant_id: number;        // active tenant context
  role: string;             // resolved app role
  scope?: {
    client_id?: string | null;
    package_id?: string | null;
    phase_id?: string | null;
  };
  now_iso: string;          // server time
  timezone: string;         // e.g. Australia/Sydney
  question?: string;        // optional, for narrowing retrieval
}

// ============= Outputs =============

export interface AskVivFactsResult {
  context: FactBuilderContext;
  facts: DerivedFact[];
  record_links: RecordLink[];
  gaps: string[];
  audit: FactBuilderAudit;
}

export interface FactBuilderContext {
  user_id: string;
  tenant_id: number;
  role: string;
  scope: {
    client_id: string | null;
    package_id: string | null;
    phase_id: string | null;
  };
  now_iso: string;
  timezone: string;
}

export interface DerivedFact {
  key: string;                  // e.g. "phase_status", "tenant_name"
  value: unknown;               // json-serialisable
  reason?: string | null;       // short explanation
  source_table: string;         // table name
  source_ids: string[];         // record ids used
  derived_at: string;           // timestamp
}

export interface RecordLink {
  table: string;
  id: string;
  label: string;
  path: string;                 // internal route
}

export interface FactBuilderAudit {
  tables_queried: string[];
  record_ids_accessed: { table: string; ids: string[] }[];
  inference_decisions: InferenceDecision[];
  query_timestamp: string;
  duration_ms: number;
}

export interface InferenceDecision {
  field: string;              // e.g. "package_id"
  action: "inferred" | "skipped" | "multiple_candidates";
  reason: string;
  inferred_value?: string | null;
}

// ============= Blocker Types =============

export type BlockerType =
  | "missing_task"
  | "missing_evidence"
  | "hours_exceeded"
  | "overdue_task"
  | "phase_incomplete"
  | "stage_blocked"
  | "stage_waiting";

export interface PhaseBlocker {
  type: BlockerType;
  label: string;
  count: number;
  source_ids: string[];
}

// ============= Internal Data Types =============

export interface TenantFactData {
  id: number;
  name: string;
  status: string;
  rto_id?: string | null;
  cricos_id?: string | null;
  risk_level?: string | null;
  package_ids?: number[];
  stage_ids?: number[];
  updated_at?: string | null;
}

export interface ClientFactData {
  id: number;
  name: string;
  status: string;
  assigned_csc?: string | null;
  updated_at?: string | null;
}

export interface PackageFactData {
  id: number;
  name: string;
  status: string;
  package_type?: string | null;
  total_hours?: number | null;
  used_hours?: number | null;
  updated_at?: string | null;
}

/**
 * Phase (stage) progress for one client's package.
 *
 * `id` is deliberately the STAGE TEMPLATE id (stages.id), not the
 * client_package_stage_state row id — this keeps it in the same ID space
 * that scope.phase_id / inferScope / findLabelForId / record-links.ts all
 * use throughout compliance-assistant. The real per-client progress row id
 * (client_package_stage_state.id) is never exposed anywhere, including in
 * record_ids/labels — an earlier version used it there for audit precision,
 * but that put record links in a different ID space than everything else,
 * producing links that pointed at the wrong identifier. Consistency wins.
 *
 * Note: the same stage template can appear more than once per tenant if
 * it's reused across multiple packages (client_package_stage_state is
 * unique on (tenant_id, package_id, stage_id), not (tenant_id, stage_id)) —
 * always pair `id` with `package_id` when matching against tasks or other
 * per-stage data, never match on `id` alone.
 */
export interface PhaseFactData {
  id: number;                        // stages.id (stage template / "phase" id)
  title: string;
  status: string;                    // client_package_stage_state.status
  stage_type?: string | null;
  due_date?: string | null;          // client_package_stage_state.due_at
  blocked_reason?: string | null;
  waiting_reason?: string | null;
  package_id?: number | null;
  updated_at?: string | null;
}

export interface TaskFactData {
  id: string;                        // tasks_tenants.id (uuid)
  task_name: string;
  status: string;
  completed: boolean;
  priority?: string | null;
  due_date?: string | null;          // tasks_tenants.due_date (NOT NULL)
  escalated_at?: string | null;
  package_id?: number | null;
  stage_id?: number | null;          // links a task to a PhaseFactData.id
  updated_at?: string | null;
}

export interface EvidenceFactData {
  id: number;
  title: string;
  category?: string | null;
  is_released: boolean;
  is_required?: boolean;
  expiry_date?: string | null;
  updated_at?: string | null;
}

export interface ActionItemFactData {
  id: string;                        // client_action_items.id (uuid)
  title: string;
  status: string;
  priority: string;
  item_type: string;                 // 'client' | 'internal'
  due_date?: string | null;
  completed_at?: string | null;
  package_id?: number | null;
  stage_id?: number | null;
}

export interface TimeFactData {
  id: string;                        // time_entries.id (uuid)
  start_at: string;
  duration_minutes: number;
  work_type?: string | null;
  is_billable: boolean;
  notes?: string | null;
}

// ============= Constants =============

export const VIVACITY_INTERNAL_ROLES = [
  "Super Admin",
  "Team Leader", 
  "Team Member",
];

export const MAX_TASKS_FOR_DERIVATION = 200;
export const MAX_DOCUMENTS_FOR_DERIVATION = 100;
export const CONSULT_LOOKBACK_DAYS = 30;
