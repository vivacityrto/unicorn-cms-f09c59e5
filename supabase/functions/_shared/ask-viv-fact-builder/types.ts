/**
 * Ask Viv Fact Builder Types
 *
 * Canonical types for the deterministic fact builder service.
 * All facts are derived, traceable, and audit-safe.
 */

import { VIVACITY_STAFF_ROLES } from "../auth-helpers.ts";

// ============= Inputs =============

export interface AskVivFactBuilderInput {
  user_id: string;          // auth.uid()
  tenant_id: number;        // active tenant context
  role: string;             // resolved app role
  /**
   * Set to "client" when called from the client-portal Ask Viv surface,
   * whose caller-role gate (validateClientAskVivAccess) already ran before
   * this is invoked. Skips the Vivacity-internal-role check in validation.ts,
   * which otherwise rejects every client-tenant role (Admin/User)
   * unconditionally — that check only makes sense for the staff assistant's
   * direct-role gate. Omit (or "staff") to keep the original staff-only
   * behaviour.
   */
  caller_role_class?: "staff" | "client";
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
  // When true, hours_included/hours_added is not a real cap — never derive
  // "nearly exhausted"/"exceeded" reasoning from total_hours vs used_hours.
  is_unlimited_override?: boolean;
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

/**
 * Recent notes/emails from v_dashboard_tenant_recent_comms — a pre-aggregated
 * dashboard view, already limited to the top 5 of each per tenant. Note
 * items can themselves have type: "email" (a logged/manual email note),
 * distinct from recent_emails which is the synced inbox (email_messages).
 */
export interface CommsFactData {
  recent_notes: Array<{
    id: string;
    type: string | null;
    title: string | null;
    preview: string | null;
    author_id: string | null;
    created_at: string;
  }>;
  recent_emails: Array<{
    id: string;
    subject: string | null;
    preview: string | null;
    sender_name: string | null;
    created_at: string;
  }>;
}

export interface AuditFactData {
  id: string;                        // client_audits.id (uuid)
  audit_type?: string | null;
  status: string;
  risk_rating?: string | null;
  risk_rationale?: string | null;
  overall_finding?: string | null;
  conducted_at?: string | null;
  closed_at?: string | null;
  next_audit_due?: string | null;
  created_at?: string | null;
}

export interface AuditFindingFactData {
  id: string;                        // client_audit_findings.id (uuid)
  audit_id: string;
  summary: string;
  standard_reference?: string | null;
  regulatory_reference?: string | null;
  impact?: string | null;
  priority?: string | null;
}

export interface AuditActionFactData {
  id: string;                        // client_audit_actions.id (uuid)
  audit_id: string;
  finding_id?: string | null;
  title: string;
  status: string;
  due_date?: string | null;
  evidence_required?: boolean | null;
  verification_status?: string | null;
}

/**
 * One row from client_timeline_events — a cross-source activity feed
 * (notes, action items, account lifecycle) distinct from the narrower
 * comms/audit/task sources above.
 */
export interface TimelineEventFactData {
  id: string;                        // client_timeline_events.id (uuid)
  event_type: string;
  title: string;
  body?: string | null;
  occurred_at: string;
  entity_type?: string | null;
  entity_id?: string | null;
}

/**
 * One row per tenant portal user, from v_client_tenant_users.
 * row_type distinguishes an active membership from a pending invite —
 * always check row_type, not just status, since a disabled member and a
 * pending invite are very different conditions for a CSC to know about.
 */
export interface TenantUserFactData {
  row_type: string;                  // 'active' | 'invited'
  user_id: string;
  display_name?: string | null;
  email?: string | null;
  relationship_role?: string | null;
  primary_contact?: boolean | null;
  secondary_contact?: boolean | null;
  access_scope?: string | null;
  status?: string | null;
  last_active_at?: string | null;
  last_sign_in_at?: string | null;
  member_since?: string | null;
  invited_at?: string | null;
  invite_expires_at?: string | null;
  delivery_status?: string | null;
}

// ============= Constants =============

// Was a hand-rolled, stale 3-role list (missing CSC/Integrator/BGT/CET) that silently
// 500'd every compliance-assistant request from those roles via validateInput() below —
// re-export the canonical list instead of maintaining a second copy.
export const VIVACITY_INTERNAL_ROLES = VIVACITY_STAFF_ROLES;

export const MAX_TASKS_FOR_DERIVATION = 200;
export const MAX_DOCUMENTS_FOR_DERIVATION = 100;
export const CONSULT_LOOKBACK_DAYS = 30;
