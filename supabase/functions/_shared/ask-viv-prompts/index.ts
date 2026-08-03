/**
 * Ask Viv Prompts Module
 * 
 * Exports all prompt-related functionality for Ask Viv.
 * Supports tiered reasoning, mode-specific prompts, and response validation.
 */

// Types
export type {
  AskVivMode,
  PromptContext,
  SystemPromptPack,
  ResponseTemplate,
  ResponseSection,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from "./types.ts";

export {
  COMPLIANCE_SECTIONS,
  KNOWLEDGE_SECTIONS,
  BANNED_PHRASES,
} from "./types.ts";

// Global prompt
import {
  GLOBAL_SYSTEM_PROMPT,
  GLOBAL_SYSTEM_PROMPT_COMPACT,
} from "./global-prompt.ts";
export { GLOBAL_SYSTEM_PROMPT, GLOBAL_SYSTEM_PROMPT_COMPACT };

// Compliance prompts
import {
  COMPLIANCE_SYSTEM_PROMPT,
  COMPLIANCE_DEVELOPER_PROMPT,
  buildCompliancePrompt,
} from "./compliance-prompt.ts";
export { COMPLIANCE_SYSTEM_PROMPT, COMPLIANCE_DEVELOPER_PROMPT, buildCompliancePrompt };

// Knowledge prompts
import {
  KNOWLEDGE_SYSTEM_PROMPT,
  KNOWLEDGE_DEVELOPER_PROMPT,
  buildKnowledgePrompt,
} from "./knowledge-prompt.ts";
export { KNOWLEDGE_SYSTEM_PROMPT, KNOWLEDGE_DEVELOPER_PROMPT, buildKnowledgePrompt };

// Response validation
export {
  validateResponse,
  sanitizeResponse,
} from "./response-validator.ts";

// Response templates
export { RESPONSE_TEMPLATES } from "./response-templates.ts";

// Intent classifier (pre-Fact-Builder routing)
export {
  classifyAskVivIntent,
  isBlockedIntent,
  getBlockedResponse,
  buildIntentAuditEntry,
  DECISION_REQUEST_REFRAME_INSTRUCTION,
  INTENT_CLASSIFIER_VERSION,
} from "./intentClassifier.ts";
export type { AskVivIntent, IntentConfidence, IntentResult, IntentAuditEntry } from "./intentClassifier.ts";

// Safety pipeline (phrase filter + response validator, with one repair pass)
export {
  runAskVivSafetyPipeline,
  buildSafetyAuditEntry,
  extractExplainSafety,
  PIPELINE_VERSION,
} from "./askVivSafetyPipeline.ts";
export type { SafetyMeta, SafetyPipelineResult } from "./askVivSafetyPipeline.ts";
export { validateAskVivResponse } from "./response-validator-v2.ts";

/**
 * Phase 6: extra instruction injected for portfolio-wide scope requests.
 * Reuses the "compliance" mode prompt pack, response validator, and safety
 * pipeline unchanged (same required sections: Answer / Key records used /
 * Confidence / Gaps / Next safe actions) — only the injected facts and this
 * instruction differ from a single-tenant compliance request, the same
 * mechanism already used for DECISION_REQUEST_REFRAME_INSTRUCTION.
 */
export const PORTFOLIO_SCOPE_INSTRUCTION = `SPECIAL HANDLING — PORTFOLIO-WIDE SCOPE

This question is about the WHOLE active client portfolio, not one tenant. FACTS now contains per-client attention data across many tenants, not one client's records:
- "portfolio_summary": totals across all active clients.
- "my_clients_attention": every client assigned to this CSC, each with an attention_score, overdue_tasks_count, days_since_activity, burn_risk_status, days_to_renewal, and top_driver.
- "portfolio_top_attention" (if present): the highest-attention clients elsewhere in the portfolio, for broader awareness — not this user's own assignments.

Rules specific to this mode:
- Always mention the caller's OWN assigned clients ("my_clients_attention") before any others — that is what "your clients" means, and it must be surfaced first, not buried.
- attention_score is a relative ranking signal, not a percentage or a compliance determination — never say a client "is compliant" or "is not compliant" based on it.
- "Key records used" should list each client tenant referenced as "<tenant_name> (tenant_id:<id>)", not table:id pairs.
- If gaps mention additional clients not shown, say so plainly rather than implying the list is exhaustive.
- Every client actually named in your answer must come from the FACTS payload — never invent a client name, score, or driver not present there.`;

/**
 * Build the complete system prompt pack for a given mode
 */
export function buildPromptPack(mode: "compliance" | "knowledge"): {
  global: string;
  mode_specific: string;
  developer: string;
} {
  if (mode === "compliance") {
    return {
      global: GLOBAL_SYSTEM_PROMPT,
      mode_specific: COMPLIANCE_SYSTEM_PROMPT,
      developer: COMPLIANCE_DEVELOPER_PROMPT,
    };
  }

  return {
    global: GLOBAL_SYSTEM_PROMPT,
    mode_specific: KNOWLEDGE_SYSTEM_PROMPT,
    developer: KNOWLEDGE_DEVELOPER_PROMPT,
  };
}

/**
 * Build the complete prompt with all layers for LLM consumption
 */
export function buildFullPrompt(
  mode: "compliance" | "knowledge",
  context: {
    facts?: unknown[];
    record_links?: unknown[];
    gaps?: string[];
    vector_results?: unknown[];
    question: string;
    extra_instructions?: string;
  }
): string {
  const pack = buildPromptPack(mode);
  const extra = context.extra_instructions ? `\n\n${context.extra_instructions}` : "";

  if (mode === "compliance") {
    // Standards citations (srto_corpus vector search results) were previously
    // accepted on this context object but never actually injected into the
    // prompt — this was pure dead weight, the LLM path never existed to read
    // it. Now that Phase 3 wires a real LLM call, these need to actually
    // reach the model so it can cite real clauses instead of inventing them.
    return `${pack.global}

${pack.mode_specific}

${pack.developer}${extra}

---
INJECTED CONTEXT:

FACTS:
${JSON.stringify(context.facts || [], null, 2)}

RECORD_LINKS:
${JSON.stringify(context.record_links || [], null, 2)}

STANDARDS_CITATIONS (from srto_corpus vector search — cite these exactly; never invent a source_document, clause, or chunk_index not listed here):
${JSON.stringify(context.vector_results || [], null, 2)}

GAPS:
${JSON.stringify(context.gaps || [])}

QUESTION:
${context.question}
---

Now answer the question following all rules and the required output format.`;
  }

  // Knowledge mode
  return `${pack.global}

${pack.mode_specific}

${pack.developer}${extra}

---
INJECTED CONTEXT:

KNOWLEDGE BASE RESULTS:
${JSON.stringify(context.vector_results || [], null, 2)}

QUESTION:
${context.question}
---

Now answer the question following all rules and the required output format.`;
}
