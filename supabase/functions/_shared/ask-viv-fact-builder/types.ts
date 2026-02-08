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
  | "phase_incomplete";

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

export interface PhaseFactData {
  id: number;
  title: string;
  status: string;
  stage_type?: string | null;
  due_date?: string | null;
  updated_at?: string | null;
}

export interface TaskFactData {
  id: string;
  task_name: string;
  status: string;
  priority?: string | null;
  due_date?: string | null;
  is_mandatory?: boolean;
  phase_id?: number | null;
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

export interface ConsultFactData {
  id: string;
  date: string;
  hours: number;
  task?: string | null;
  consultant?: string | null;
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
