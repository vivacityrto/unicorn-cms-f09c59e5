/**
 * Ask Viv Intent Classifier
 * 
 * Lightweight intent classifier that runs before Fact Builder.
 * Routes questions into safe paths and blocks decision-seeking prompts early.
 * 
 * Pipeline order: Intent Classifier → Fact Builder → LLM → Safety Pipeline → UI
 */

import { type AskVivMode } from "./types.ts";

/**
 * Classifier version for audit tracking
 */
export const INTENT_CLASSIFIER_VERSION = "v1";

/**
 * Intent classes
 */
export type AskVivIntent =
  | "status"
  | "explanation"
  | "gap_analysis"
  | "decision_request"
  | "out_of_scope";

/**
 * Confidence levels
 */
export type IntentConfidence = "High" | "Medium" | "Low";

/**
 * Intent classification result
 */
export interface IntentResult {
  intent: AskVivIntent;
  confidence: IntentConfidence;
  triggers: string[];
  safe_rephrase?: string | null;
}

/**
 * Audit log entry for intent classification
 */
export interface IntentAuditEntry {
  intent: {
    class: AskVivIntent;
    confidence: IntentConfidence;
    triggers: string[];
    version: string;
  };
}

/**
 * Blocked intents that should not proceed to Fact Builder
 */
export const BLOCKED_INTENTS: readonly AskVivIntent[] = [
  "decision_request",
  "out_of_scope",
] as const;

/**
 * Check if an intent is blocked
 */
export function isBlockedIntent(intent: AskVivIntent): boolean {
  return BLOCKED_INTENTS.includes(intent);
}

// ============================================================
// Keyword and phrase sets for each intent class
// ============================================================

/**
 * decision_request triggers - any match blocks the request
 */
const DECISION_REQUEST_PHRASES: readonly string[] = [
  "should we",
  "can we submit",
  "ready to submit",
  "is this compliant",
  "are we compliant",
  "approve",
  "sign off",
  "can we progress",
  "move to next phase",
  "ok to lodge",
  "will asqa",
  "guarantee",
  "pass audit",
  "is this enough",
  "meets the standard",
  "does this meet",
] as const;

/**
 * gap_analysis triggers
 */
const GAP_ANALYSIS_PHRASES: readonly string[] = [
  "missing",
  "what is missing",
  "gaps",
  "blockers",
  "why is this stuck",
  "what is blocking",
  "requirements",
  "what do we need",
  "incomplete",
  "overdue",
] as const;

/**
 * status triggers
 */
const STATUS_PHRASES: readonly string[] = [
  "status",
  "where are we at",
  "current phase",
  "progress",
  "summary",
  "last activity",
  "due",
  "open tasks",
  "what is next",
] as const;

/**
 * explanation triggers
 */
const EXPLANATION_PHRASES: readonly string[] = [
  "what does",
  "explain",
  "how do",
  "why",
  "difference between",
  "meaning of",
  "help me understand",
] as const;

/**
 * out_of_scope triggers - personal, unrelated, or policy bypass
 */
const OUT_OF_SCOPE_PHRASES: readonly string[] = [
  // Personal or unrelated
  "recipe",
  "holiday",
  "football",
  "bitcoin",
  "weather",
  "joke",
  // System hacking or policy bypass
  "ignore",
  "bypass policy",
  "disable rls",
  "ignore instructions",
  "pretend you are",
  "act as if",
  // Requests for client-visible advice or external comms
  "write to the client",
  "tell the regulator",
  "email the client",
  "advise the client that they are compliant",
  "send to asqa",
] as const;

// ============================================================
// Safe rephrase suggestions for blocked intents
// ============================================================

/**
 * Safe rephrase suggestions for decision_request
 */
export const DECISION_REQUEST_REPHRASES: readonly string[] = [
  "What gaps or blockers exist for this phase?",
  "Summarise current status and overdue mandatory tasks.",
  "List missing evidence types for this phase.",
] as const;

/**
 * Safe rephrase suggestions for out_of_scope
 */
export const OUT_OF_SCOPE_REPHRASES: readonly string[] = [
  "What is the current status for this client?",
  "List blockers for the current phase.",
  "What mandatory tasks are overdue?",
] as const;

// ============================================================
// Normalisation
// ============================================================

/**
 * Normalise question text for matching
 * - Lowercase
 * - Trim
 * - Collapse whitespace
 */
function normalise(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, " ");
}

// ============================================================
// Matching logic
// ============================================================

interface MatchResult {
  matched: boolean;
  triggers: string[];
  isExactPhrase: boolean;
}

/**
 * Check if normalised text matches any phrases from a set
 */
function matchPhrases(normalised: string, phrases: readonly string[]): MatchResult {
  const triggers: string[] = [];
  let isExactPhrase = false;

  for (const phrase of phrases) {
    const normPhrase = phrase.toLowerCase();
    if (normalised.includes(normPhrase)) {
      triggers.push(phrase);
      // Check if it's an exact phrase match (longer phrases = higher confidence)
      if (normPhrase.split(" ").length >= 2) {
        isExactPhrase = true;
      }
    }
  }

  return {
    matched: triggers.length > 0,
    triggers,
    isExactPhrase,
  };
}

/**
 * Determine confidence based on match quality
 */
function determineConfidence(
  isExactPhrase: boolean,
  triggerCount: number
): IntentConfidence {
  if (isExactPhrase) {
    return "High";
  }
  if (triggerCount >= 1) {
    return "Medium";
  }
  return "Low";
}

// ============================================================
// Main classifier
// ============================================================

/**
 * Classify Ask Viv question intent
 * 
 * Uses deterministic rules with strict priority order:
 * 1. out_of_scope
 * 2. decision_request
 * 3. gap_analysis
 * 4. status
 * 5. explanation
 * 
 * Defaults to explanation with Low confidence if no match.
 */
export function classifyAskVivIntent(question: string): IntentResult {
  const normalised = normalise(question);

  // Priority 1: out_of_scope
  const outOfScopeMatch = matchPhrases(normalised, OUT_OF_SCOPE_PHRASES);
  if (outOfScopeMatch.matched) {
    return {
      intent: "out_of_scope",
      confidence: determineConfidence(outOfScopeMatch.isExactPhrase, outOfScopeMatch.triggers.length),
      triggers: outOfScopeMatch.triggers,
      safe_rephrase: OUT_OF_SCOPE_REPHRASES[0],
    };
  }

  // Priority 2: decision_request
  const decisionMatch = matchPhrases(normalised, DECISION_REQUEST_PHRASES);
  if (decisionMatch.matched) {
    return {
      intent: "decision_request",
      confidence: determineConfidence(decisionMatch.isExactPhrase, decisionMatch.triggers.length),
      triggers: decisionMatch.triggers,
      safe_rephrase: DECISION_REQUEST_REPHRASES[0],
    };
  }

  // Priority 3: gap_analysis
  const gapMatch = matchPhrases(normalised, GAP_ANALYSIS_PHRASES);
  if (gapMatch.matched) {
    return {
      intent: "gap_analysis",
      confidence: determineConfidence(gapMatch.isExactPhrase, gapMatch.triggers.length),
      triggers: gapMatch.triggers,
      safe_rephrase: null,
    };
  }

  // Priority 4: status
  const statusMatch = matchPhrases(normalised, STATUS_PHRASES);
  if (statusMatch.matched) {
    return {
      intent: "status",
      confidence: determineConfidence(statusMatch.isExactPhrase, statusMatch.triggers.length),
      triggers: statusMatch.triggers,
      safe_rephrase: null,
    };
  }

  // Priority 5: explanation
  const explanationMatch = matchPhrases(normalised, EXPLANATION_PHRASES);
  if (explanationMatch.matched) {
    return {
      intent: "explanation",
      confidence: determineConfidence(explanationMatch.isExactPhrase, explanationMatch.triggers.length),
      triggers: explanationMatch.triggers,
      safe_rephrase: null,
    };
  }

  // Default: explanation with Low confidence
  return {
    intent: "explanation",
    confidence: "Low",
    triggers: [],
    safe_rephrase: null,
  };
}

// ============================================================
// Blocked response templates
// ============================================================

/**
 * Blocked response for decision_request (Compliance mode)
 */
const DECISION_REQUEST_RESPONSE = `## Answer
- This request asks for a decision or approval.
- Ask Viv cannot provide submission or phase-advance decisions.

## Key records used
- None.

## Confidence
**Low**

## Gaps
- A human review is required to confirm readiness.

## Next safe actions
- Ask: "What gaps or blockers exist for this phase?"
- Ask: "Summarise current status and overdue mandatory tasks."
- Ask: "List missing evidence types for this phase."
- Escalate to the CSC lead for sign-off.`;

/**
 * Blocked response for out_of_scope (Compliance mode)
 */
const OUT_OF_SCOPE_RESPONSE = `## Answer
- This request is outside Ask Viv's scope for internal compliance work.

## Key records used
- None.

## Confidence
**Low**

## Gaps
- The question does not relate to client status, gaps, or internal procedures.

## Next safe actions
- Rephrase the question to a specific client, package, or phase.
- Ask for current status, blockers, or missing evidence.`;

/**
 * Blocked response for decision_request (Knowledge mode)
 */
const DECISION_REQUEST_KNOWLEDGE_RESPONSE = `## Answer
- This request asks for a decision or approval.
- Ask Viv cannot provide regulatory or procedural decisions.

## References
- None.

## Confidence
**Low**

## Gaps
- A human review is required for interpretation.

## Next safe actions
- Ask: "Explain the requirements for this procedure."
- Ask: "What does the internal guidance say about this?"
- Escalate to the Function Lead for clarification.`;

/**
 * Blocked response for out_of_scope (Knowledge mode)
 */
const OUT_OF_SCOPE_KNOWLEDGE_RESPONSE = `## Answer
- This request is outside Ask Viv's scope for internal knowledge queries.

## References
- None.

## Confidence
**Low**

## Gaps
- The question does not relate to internal procedures or policies.

## Next safe actions
- Rephrase the question to focus on internal procedures.
- Ask about specific policy or process documentation.`;

/**
 * Get blocked response for a given intent and mode
 */
export function getBlockedResponse(
  intent: AskVivIntent,
  mode: AskVivMode
): string {
  if (intent === "decision_request") {
    return mode === "compliance" 
      ? DECISION_REQUEST_RESPONSE 
      : DECISION_REQUEST_KNOWLEDGE_RESPONSE;
  }
  
  if (intent === "out_of_scope") {
    return mode === "compliance"
      ? OUT_OF_SCOPE_RESPONSE
      : OUT_OF_SCOPE_KNOWLEDGE_RESPONSE;
  }

  // Fallback - should not reach here for non-blocked intents
  return OUT_OF_SCOPE_RESPONSE;
}

/**
 * Get safe rephrase suggestions for a blocked intent
 */
export function getSafeRephrases(intent: AskVivIntent): readonly string[] {
  if (intent === "decision_request") {
    return DECISION_REQUEST_REPHRASES;
  }
  if (intent === "out_of_scope") {
    return OUT_OF_SCOPE_REPHRASES;
  }
  return [];
}

// ============================================================
// Audit logging
// ============================================================

/**
 * Build audit log entry for intent classification
 */
export function buildIntentAuditEntry(result: IntentResult): IntentAuditEntry {
  return {
    intent: {
      class: result.intent,
      confidence: result.confidence,
      triggers: result.triggers,
      version: INTENT_CLASSIFIER_VERSION,
    },
  };
}
