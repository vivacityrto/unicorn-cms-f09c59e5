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
export {
  GLOBAL_SYSTEM_PROMPT,
  GLOBAL_SYSTEM_PROMPT_COMPACT,
} from "./global-prompt.ts";

// Compliance prompts
export {
  COMPLIANCE_SYSTEM_PROMPT,
  COMPLIANCE_DEVELOPER_PROMPT,
  buildCompliancePrompt,
} from "./compliance-prompt.ts";

// Knowledge prompts
export {
  KNOWLEDGE_SYSTEM_PROMPT,
  KNOWLEDGE_DEVELOPER_PROMPT,
  buildKnowledgePrompt,
} from "./knowledge-prompt.ts";

// Response validation
export {
  validateResponse,
  sanitizeResponse,
} from "./response-validator.ts";

// Response templates
export { RESPONSE_TEMPLATES } from "./response-templates.ts";

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
  }
): string {
  const pack = buildPromptPack(mode);

  if (mode === "compliance") {
    return `${pack.global}

${pack.mode_specific}

${pack.developer}

---
INJECTED CONTEXT:

FACTS:
${JSON.stringify(context.facts || [], null, 2)}

RECORD_LINKS:
${JSON.stringify(context.record_links || [], null, 2)}

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

${pack.developer}

---
INJECTED CONTEXT:

KNOWLEDGE BASE RESULTS:
${JSON.stringify(context.vector_results || [], null, 2)}

QUESTION:
${context.question}
---

Now answer the question following all rules and the required output format.`;
}
