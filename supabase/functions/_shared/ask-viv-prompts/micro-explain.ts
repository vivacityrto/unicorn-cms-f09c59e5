/**
 * Ask Viv Micro-Explain
 * 
 * Provides short, plain-English explanations when Ask Viv blocks or refuses a response.
 * Fixed text only - no LLM-generated content.
 * 
 * Used by:
 * - Intent classifier (decision_request, out_of_scope)
 * - Phrase filter (safety_fallback)
 * - Response validator (safety_fallback)
 */

/**
 * Micro-explain version for audit tracking
 */
export const MICRO_EXPLAIN_VERSION = "v1";

/**
 * Reason codes for micro-explain
 */
export type MicroExplainReason =
  | "decision_request"
  | "out_of_scope"
  | "safety_fallback";

/**
 * Micro-explain payload included in blocked responses
 */
export interface MicroExplainPayload {
  reason: MicroExplainReason;
  message: string;
  usage_rules_link: string;
}

/**
 * Audit entry for micro-explain logging
 */
export interface MicroExplainAuditEntry {
  micro_explain: {
    shown: boolean;
    reason: MicroExplainReason;
    version: string;
  };
}

/**
 * Default link to internal usage rules
 */
export const USAGE_RULES_LINK = "/internal/ask-viv/usage-rules";

/**
 * Fixed micro-explain messages - never LLM-generated
 */
const MICRO_EXPLAIN_MESSAGES: Record<MicroExplainReason, string> = {
  decision_request:
    "Why can't Ask Viv answer this?\nThis request implies a decision, approval, or submission outcome. Ask Viv provides status and gap visibility only. Human judgement is required.",
  
  out_of_scope:
    "Why can't Ask Viv answer this?\nThis request is outside Ask Viv's internal compliance support scope.",
  
  safety_fallback:
    "Why can't Ask Viv answer this?\nThe response could not be returned safely within compliance controls.",
};

/**
 * Build micro-explain payload for a given reason
 * 
 * @param reason - The reason for blocking
 * @returns MicroExplainPayload with fixed message text
 */
export function buildMicroExplainPayload(
  reason: MicroExplainReason
): MicroExplainPayload {
  return {
    reason,
    message: MICRO_EXPLAIN_MESSAGES[reason],
    usage_rules_link: USAGE_RULES_LINK,
  };
}

/**
 * Build micro-explain payload from intent classifier result
 * 
 * @param intent - The blocked intent (decision_request or out_of_scope)
 * @returns MicroExplainPayload or null if intent is not blocked
 */
export function buildMicroExplainFromIntent(
  intent: "decision_request" | "out_of_scope" | string
): MicroExplainPayload | null {
  if (intent === "decision_request" || intent === "out_of_scope") {
    return buildMicroExplainPayload(intent);
  }
  return null;
}

/**
 * Build micro-explain payload for phrase filter or validator fallback
 * 
 * @returns MicroExplainPayload for safety fallback
 */
export function buildMicroExplainForSafetyFallback(): MicroExplainPayload {
  return buildMicroExplainPayload("safety_fallback");
}

/**
 * Build audit log entry for micro-explain
 * 
 * @param reason - The micro-explain reason shown
 * @returns Audit entry to merge into request_context
 */
export function buildMicroExplainAuditEntry(
  reason: MicroExplainReason
): MicroExplainAuditEntry {
  return {
    micro_explain: {
      shown: true,
      reason,
      version: MICRO_EXPLAIN_VERSION,
    },
  };
}

/**
 * Check if a response should show micro-explain
 * 
 * @param blocked - Whether the response was blocked
 * @param reason - Optional reason code
 * @returns true if micro-explain should be shown
 */
export function shouldShowMicroExplain(
  blocked: boolean,
  reason?: MicroExplainReason | null
): boolean {
  return blocked && reason != null;
}
