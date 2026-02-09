/**
 * Ask Viv Gap Key Mapper
 * 
 * Standardises free-text gaps from Fact Builder into controlled telemetry keys.
 * Ensures telemetry contains only standardised gap identifiers, not free text.
 * 
 * Used by: qualityTelemetry.ts
 */

/**
 * Version for audit tracking
 */
export const GAP_KEY_MAPPER_VERSION = "v1";

/**
 * Standardised gap keys for telemetry
 * These are the ONLY values that should appear in ai_quality_events.gap_keys
 */
export type StandardGapKey =
  | "missing_scope_client"
  | "missing_scope_package"
  | "missing_scope_phase"
  | "multiple_active_packages"
  | "no_activity_history"
  | "missing_required_evidence"
  | "missing_tasks_data"
  | "insufficient_permissions"
  | "stale_data"
  | "missing_consult_logs"
  | "missing_phase_status"
  | "missing_document_data"
  | "incomplete_tailoring"
  | "missing_standard_mapping"
  | "other";

/**
 * Gap pattern matchers
 * Order matters - more specific patterns should come first
 */
const GAP_PATTERNS: Array<{ pattern: RegExp; key: StandardGapKey }> = [
  // Scope-related gaps
  { pattern: /client.*not\s+(?:selected|specified|set)|no\s+client|missing.*client|select.*client/i, key: "missing_scope_client" },
  { pattern: /package.*not\s+(?:selected|specified|set)|no\s+package|missing.*package|select.*package/i, key: "missing_scope_package" },
  { pattern: /phase.*not\s+(?:selected|specified|set)|no\s+phase|missing.*phase|select.*phase/i, key: "missing_scope_phase" },
  { pattern: /multiple.*(?:active|packages)|more\s+than\s+one\s+package/i, key: "multiple_active_packages" },

  // Activity and history gaps
  { pattern: /no\s+(?:recent\s+)?activity|activity.*(?:history|found)|stale.*data|data.*stale/i, key: "no_activity_history" },
  { pattern: /stale|outdated|last.*(?:updated|activity).*(?:days|weeks)\s+ago/i, key: "stale_data" },

  // Evidence and documentation gaps
  { pattern: /evidence.*(?:missing|required|not\s+found)|missing.*evidence|upload.*evidence/i, key: "missing_required_evidence" },
  { pattern: /document.*(?:missing|required|not\s+found)|missing.*document/i, key: "missing_document_data" },

  // Task gaps
  { pattern: /task.*(?:missing|not\s+found|data)|missing.*task|no\s+tasks/i, key: "missing_tasks_data" },

  // Permission gaps
  { pattern: /permission|access.*denied|not\s+authoriz|insufficient.*access/i, key: "insufficient_permissions" },

  // Consult and phase gaps
  { pattern: /consult.*(?:log|missing|not\s+found)|no\s+consult/i, key: "missing_consult_logs" },
  { pattern: /phase.*status|status.*(?:unknown|missing)/i, key: "missing_phase_status" },

  // Compliance-specific gaps
  { pattern: /tailoring.*(?:incomplete|missing)|incomplete.*tailoring/i, key: "incomplete_tailoring" },
  { pattern: /standard.*(?:mapping|reference)|mapping.*(?:missing|not\s+found)/i, key: "missing_standard_mapping" },
];

/**
 * Map a single gap string to a standardised key
 * 
 * @param gap - Free-text gap string from Fact Builder
 * @returns Standardised gap key
 */
export function mapGapToKey(gap: string): StandardGapKey {
  if (!gap || typeof gap !== "string") {
    return "other";
  }

  const normalizedGap = gap.trim().toLowerCase();

  for (const { pattern, key } of GAP_PATTERNS) {
    if (pattern.test(normalizedGap)) {
      return key;
    }
  }

  return "other";
}

/**
 * Map multiple gap strings to standardised keys
 * Deduplicates the result.
 * 
 * @param gaps - Array of free-text gap strings from Fact Builder
 * @returns Array of unique standardised gap keys
 */
export function mapGapsToKeys(gaps: string[]): StandardGapKey[] {
  if (!Array.isArray(gaps)) {
    return [];
  }

  const keys = gaps.map(mapGapToKey);
  return [...new Set(keys)]; // Deduplicate
}

/**
 * Get all valid gap keys (for validation/documentation)
 */
export function getValidGapKeys(): StandardGapKey[] {
  return [
    "missing_scope_client",
    "missing_scope_package",
    "missing_scope_phase",
    "multiple_active_packages",
    "no_activity_history",
    "missing_required_evidence",
    "missing_tasks_data",
    "insufficient_permissions",
    "stale_data",
    "missing_consult_logs",
    "missing_phase_status",
    "missing_document_data",
    "incomplete_tailoring",
    "missing_standard_mapping",
    "other",
  ];
}
