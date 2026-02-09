/**
 * Ask Viv Phrase Filter
 * 
 * Safety layer that detects and blocks unsafe, non-compliant, or regulator-facing
 * language before responses reach the UI. Fails closed - blocks entire response
 * rather than partial redaction.
 * 
 * Integration order: LLM output → Phrase filter → Response validator → UI
 */

import { type AskVivMode } from "./types.ts";

/**
 * Filter version for audit tracking
 */
export const PHRASE_FILTER_VERSION = "v1";

/**
 * Result of phrase filter detection
 */
export interface PhraseFilterResult {
  blocked: boolean;
  matches: string[];
  categories: PhraseCategory[];
}

/**
 * Audit log entry for blocked responses
 */
export interface PhraseFilterAuditEntry {
  phrase_filter: {
    blocked: boolean;
    matches: string[];
    categories: PhraseCategory[];
    filter_version: string;
  };
}

/**
 * Categories of banned phrases
 */
export type PhraseCategory = 
  | "regulatory_action" 
  | "phase_bypass" 
  | "deterministic_compliance";

/**
 * Banned phrase patterns organized by category
 * All patterns are case-insensitive
 */
const BANNED_PATTERNS: Record<PhraseCategory, RegExp[]> = {
  /**
   * Regulatory action language
   * Blocks any suggestion of regulator action or outcome
   */
  regulatory_action: [
    /\bsubmit\b/i,
    /\bsubmission\b/i,
    /\blodge\b/i,
    /\blodgement\b/i,
    /\basqa\s+will\b/i,
    /\basqa\s+would\b/i,
    /\bregulator\s+will\b/i,
    /\bapproved\b/i,
    /\bapproval\b/i,
    /\bguarantee\b/i,
  ],

  /**
   * Phase bypass or authority override
   * Blocks language that advances or skips workflow controls
   */
  phase_bypass: [
    /\bmove\s+to\s+next\s+phase\b/i,
    /\bprogress\s+to\b/i,
    /\byou\s+should\s+progress\b/i,
    /\badvance\s+phase\b/i,
    /\bbypass\b/i,
    /\bskip\b/i,
    /\boverride\b/i,
  ],

  /**
   * Deterministic compliance claims
   * Blocks definitive compliance statements
   * Allowed alternatives: "risk indicator", "gap identified", "insufficient evidence to confirm"
   */
  deterministic_compliance: [
    /\bcompliant\b/i,
    /\bnon-compliant\b/i,
    /\bmeets\s+the\s+standard\b/i,
    /\bdoes\s+not\s+meet\s+the\s+standard\b/i,
  ],
};

/**
 * Fallback response templates for blocked content
 */
const FALLBACK_TEMPLATES: Record<AskVivMode, string> = {
  compliance: `## Answer
- This request cannot be answered safely with the available controls.

## Key records used
- None.

## Confidence
**Low**

## Gaps
- The request implies a regulatory action or phase change that requires human judgement.

## Next safe actions
- Review the linked records directly.
- Escalate to the CSC lead for confirmation.
- Rephrase the question to focus on current status or gaps.`,

  knowledge: `## Answer
- This topic requires interpretation beyond internal guidance.

## References
- None.

## Confidence
**Low**

## Gaps
- The request implies an outcome or decision that must be confirmed by a Vivacity lead.

## Next safe actions
- Check the relevant internal procedure.
- Escalate to the Function Lead for clarification.`,
};

/**
 * Detect banned phrases in text
 * 
 * Does not short-circuit - captures ALL matches for comprehensive audit logging.
 * 
 * @param text - The text to scan for banned phrases
 * @returns Filter result with blocked status, all matches, and triggered categories
 */
export function detectBannedPhrases(text: string): PhraseFilterResult {
  const matches: string[] = [];
  const categories: Set<PhraseCategory> = new Set();

  // Normalize text for consistent matching
  const normalizedText = text.toLowerCase();

  // Check all categories - do not short-circuit
  for (const [category, patterns] of Object.entries(BANNED_PATTERNS)) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        matches.push(match[0]);
        categories.add(category as PhraseCategory);
      }
    }
  }

  return {
    blocked: matches.length > 0,
    matches: [...new Set(matches)], // Deduplicate matches
    categories: Array.from(categories),
  };
}

/**
 * Build a safe fallback response for blocked content
 * 
 * @param mode - The Ask Viv mode (knowledge or compliance)
 * @param matches - The banned phrases that were detected (for logging context)
 * @returns Safe fallback response text
 */
export function buildBlockedResponse(
  mode: AskVivMode,
  matches: string[]
): string {
  return FALLBACK_TEMPLATES[mode];
}

/**
 * Build audit log entry for phrase filter results
 * 
 * @param result - The phrase filter result
 * @returns Audit entry to merge into request_context
 */
export function buildAuditEntry(result: PhraseFilterResult): PhraseFilterAuditEntry {
  return {
    phrase_filter: {
      blocked: result.blocked,
      matches: result.matches,
      categories: result.categories,
      filter_version: PHRASE_FILTER_VERSION,
    },
  };
}

/**
 * Apply phrase filter to LLM response
 * 
 * Main integration function - call this after LLM generation, before response validator.
 * If blocked, returns fallback response and audit entry.
 * If safe, returns original response unchanged.
 * 
 * @param llmResponse - Raw LLM response text
 * @param mode - The Ask Viv mode
 * @returns Filtered response and metadata
 */
export function applyPhraseFilter(
  llmResponse: string,
  mode: AskVivMode
): {
  response: string;
  blocked: boolean;
  auditEntry: PhraseFilterAuditEntry | null;
} {
  const filterResult = detectBannedPhrases(llmResponse);

  if (filterResult.blocked) {
    return {
      response: buildBlockedResponse(mode, filterResult.matches),
      blocked: true,
      auditEntry: buildAuditEntry(filterResult),
    };
  }

  return {
    response: llmResponse,
    blocked: false,
    auditEntry: null,
  };
}
