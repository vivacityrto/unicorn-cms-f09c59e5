/**
 * AI Brain Type Definitions
 * 
 * Canonical types for the Vivacity Team AI Brain architecture.
 * All AI reasoning operates on these structured types.
 */

// ============= Layer 1: AI Context Model =============

export interface AIUserContext {
  id: string;
  role: string;
  function: string | null;
  is_internal: boolean;
  display_name: string | null;
}

export interface AITenantContext {
  id: number;
  name: string;
  status: string;
  rto_id: string | null;
  risk_level: string | null;
}

export interface AIScopeContext {
  client_id: number | null;
  package_id: number | null;
  phase_id: number | null;
  document_id: number | null;
}

export interface AITimeContext {
  now: string;
  timezone: string;
  quarter: number;
  year: number;
}

/**
 * Canonical AI Context Payload
 * Injected before any AI reasoning.
 */
export interface AIContext {
  user: AIUserContext;
  tenant: AITenantContext | null;
  scope: AIScopeContext;
  time: AITimeContext;
  session_id: string;
}

// ============= Layer 2: Fact System =============

export type FactCategory = 
  | "client"
  | "package"
  | "phase"
  | "task"
  | "evidence"
  | "consult"
  | "risk"
  | "compliance";

export type FactType =
  // Status facts
  | "client_status"
  | "package_status"
  | "phase_status"
  | "task_status"
  | "evidence_status"
  // Blocker facts
  | "phase_blocked"
  | "task_blocked"
  | "evidence_missing"
  | "deadline_at_risk"
  // Risk facts
  | "audit_exposure"
  | "compliance_gap"
  | "evidence_conflict"
  | "capacity_risk"
  // Summary facts
  | "package_summary"
  | "phase_summary"
  | "task_summary"
  | "consult_summary"
  | "evidence_summary";

/**
 * A deterministic, traceable fact.
 */
export interface Fact {
  id: string;
  type: FactType;
  category: FactCategory;
  value: unknown;
  label: string;
  reason: string | null;
  source_table: string;
  source_ids: string[];
  timestamp: string;
  freshness_score: number; // 0-1, 1 = very fresh
}

/**
 * Collection of facts organized by category.
 */
export interface FactSet {
  facts: Fact[];
  generated_at: string;
  tenant_id: number;
  fact_count: number;
  categories: FactCategory[];
}

// ============= Layer 3: Reasoning Tiers =============

export type ReasoningTier = "status" | "blockers" | "risk" | "actions";

export interface TierResult {
  tier: ReasoningTier;
  findings: TierFinding[];
  can_proceed: boolean;
  reasoning_notes: string[];
}

export interface TierFinding {
  id: string;
  tier: ReasoningTier;
  summary: string;
  details: string | null;
  severity: "info" | "warning" | "critical";
  source_facts: string[]; // Fact IDs
  actionable: boolean;
}

export interface ReasoningOutput {
  tiers: TierResult[];
  final_summary: string;
  confidence: ConfidenceLevel;
  escalation_required: boolean;
  escalation_triggers: EscalationTrigger[];
}

// ============= Layer 4: Confidence Scoring =============

export type ConfidenceLevel = "high" | "medium" | "low";

export interface ConfidenceFactors {
  data_freshness: number; // 0-1
  evidence_completeness: number; // 0-1
  rule_coverage: number; // 0-1
  source_count: number;
  conflict_count: number;
}

export interface ConfidenceResult {
  level: ConfidenceLevel;
  factors: ConfidenceFactors;
  explanation: string;
  caution_required: boolean;
}

// ============= Layer 5: Escalation System =============

export type EscalationTriggerType =
  | "high_risk_deadline"
  | "conflicting_evidence"
  | "phase_bypass_attempt"
  | "compliance_gap_critical"
  | "evidence_mismatch"
  | "capacity_exceeded";

export interface EscalationTrigger {
  type: EscalationTriggerType;
  severity: "warning" | "critical";
  message: string;
  source_facts: string[];
  suggested_action: string;
  triggered_at: string;
}

// ============= Layer 6: Memory Rules =============

export interface SessionMemory {
  session_id: string;
  user_id: string;
  tenant_id: number | null;
  started_at: string;
  messages: MemoryMessage[];
  facts_accessed: string[];
}

export interface MemoryMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  facts_used: string[];
}

// ============= Output Types =============

export interface AIBrainResponse {
  answer_markdown: string;
  context_used: AIContext;
  facts_used: Fact[];
  reasoning: ReasoningOutput;
  confidence: ConfidenceResult;
  escalations: EscalationTrigger[];
  source_citations: SourceCitation[];
  governance: GovernanceInfo;
}

export interface SourceCitation {
  table: string;
  id: string | number;
  label: string;
  accessed_at: string;
}

export interface GovernanceInfo {
  read_only: boolean;
  human_action_required: boolean;
  caution_banners: string[];
  review_reminders: string[];
}
