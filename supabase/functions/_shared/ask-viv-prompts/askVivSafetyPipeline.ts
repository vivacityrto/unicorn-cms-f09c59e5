/**
 * Ask Viv Safety Pipeline
 * 
 * Unified middleware that enforces:
 * 1. Phrase filter (block unsafe language)
 * 2. Response structure validator (repair once, else fallback)
 * 3. Standard audit logging of safety outcomes
 * 
 * Pipeline order:
 * LLM output → Phrase filter → Validator → (Repair once if needed) → Final response
 */

import { type AskVivMode } from "./types.ts";
import {
  detectBannedPhrases,
  buildBlockedResponse as buildPhraseFilterFallback,
  PHRASE_FILTER_VERSION,
  type PhraseFilterResult,
} from "./phrase-filter.ts";
import {
  validateAskVivResponse,
  buildFallbackResponse as buildValidatorFallback,
  buildRepairPrompt,
  VALIDATOR_VERSION,
  type ValidationInputMeta,
  type ValidationResult,
  type RecordReference,
} from "./response-validator-v2.ts";

// Re-export for consumers
export type { ValidationInputMeta, RecordReference };

/**
 * Pipeline version for audit tracking
 */
export const PIPELINE_VERSION = "v1";

/**
 * Extended metadata for safety pipeline
 */
export interface SafetyMeta extends ValidationInputMeta {
  request_id: string;
  user_id: string;
  tenant_id?: string | null;
}

/**
 * Phrase filter outcome in pipeline result
 */
export interface PhraseFilterOutcome {
  blocked: boolean;
  matches: string[];
  categories: string[];
  version: string;
}

/**
 * Validator outcome in pipeline result
 */
export interface ValidatorOutcome {
  ok: boolean;
  errors: string[];
  repaired: boolean;
  version: string;
}

/**
 * Complete safety pipeline result
 */
export interface SafetyPipelineResult {
  ok: boolean;
  final_text: string;
  blocked: boolean;
  repaired: boolean;
  phrase_filter: PhraseFilterOutcome;
  validator: ValidatorOutcome;
}

/**
 * Audit log entry for safety pipeline
 */
export interface SafetyAuditEntry {
  ask_viv_safety: {
    phrase_filter: PhraseFilterOutcome;
    validator: ValidatorOutcome;
    pipeline: {
      blocked: boolean;
      repaired: boolean;
      version: string;
    };
  };
}

/**
 * Build phrase filter outcome from result
 */
function buildPhraseFilterOutcome(result: PhraseFilterResult): PhraseFilterOutcome {
  return {
    blocked: result.blocked,
    matches: result.matches,
    categories: result.categories,
    version: PHRASE_FILTER_VERSION,
  };
}

/**
 * Build validator outcome from result
 */
function buildValidatorOutcome(result: ValidationResult, repaired: boolean): ValidatorOutcome {
  return {
    ok: result.ok,
    errors: result.errors,
    repaired,
    version: VALIDATOR_VERSION,
  };
}

/**
 * Run the complete Ask Viv safety pipeline
 * 
 * Pipeline order:
 * 1. Phrase filter - if blocked, return fallback immediately
 * 2. Validator - if invalid, attempt one repair
 * 3. After repair: run phrase filter + validator again
 * 4. If still invalid or blocked: return fallback
 * 
 * Fail closed. One repair only.
 */
export async function runAskVivSafetyPipeline(args: {
  mode: AskVivMode;
  raw_text: string;
  meta: SafetyMeta;
  repairOnce: (repairInstruction: string) => Promise<string>;
}): Promise<SafetyPipelineResult> {
  const { mode, raw_text, meta, repairOnce } = args;

  // Step 1: Run phrase filter on raw LLM output
  const phraseFilterResult = detectBannedPhrases(raw_text);

  if (phraseFilterResult.blocked) {
    // Phrase filter blocked - return safe fallback immediately
    // Do not run validator, do not attempt repair
    return {
      ok: false,
      final_text: buildPhraseFilterFallback(mode, phraseFilterResult.matches),
      blocked: true,
      repaired: false,
      phrase_filter: buildPhraseFilterOutcome(phraseFilterResult),
      validator: {
        ok: false,
        errors: ["Skipped - phrase filter blocked response"],
        repaired: false,
        version: VALIDATOR_VERSION,
      },
    };
  }

  // Step 2: Run validator on raw LLM output
  const validatorResult = validateAskVivResponse(raw_text, meta);

  if (validatorResult.ok) {
    // Both passed - return original text
    return {
      ok: true,
      final_text: raw_text,
      blocked: false,
      repaired: false,
      phrase_filter: buildPhraseFilterOutcome(phraseFilterResult),
      validator: buildValidatorOutcome(validatorResult, false),
    };
  }

  // Step 3: Validator failed - attempt one repair
  const fullRepairPrompt = buildRepairPrompt(raw_text, validatorResult.errors, meta);

  let repairedText: string;
  try {
    repairedText = await repairOnce(fullRepairPrompt);
  } catch (error) {
    // Repair call failed - return validator fallback
    return {
      ok: false,
      final_text: buildValidatorFallback(meta),
      blocked: false,
      repaired: false,
      phrase_filter: buildPhraseFilterOutcome(phraseFilterResult),
      validator: buildValidatorOutcome(validatorResult, false),
    };
  }

  // Step 4: After repair - run phrase filter again
  const repairedPhraseFilterResult = detectBannedPhrases(repairedText);

  if (repairedPhraseFilterResult.blocked) {
    // Repaired text is blocked - return phrase filter fallback
    return {
      ok: false,
      final_text: buildPhraseFilterFallback(mode, repairedPhraseFilterResult.matches),
      blocked: true,
      repaired: true,
      phrase_filter: buildPhraseFilterOutcome(repairedPhraseFilterResult),
      validator: {
        ok: false,
        errors: ["Skipped - repaired response blocked by phrase filter"],
        repaired: true,
        version: VALIDATOR_VERSION,
      },
    };
  }

  // Step 5: Run validator on repaired text
  const repairedValidatorResult = validateAskVivResponse(repairedText, meta);

  if (repairedValidatorResult.ok) {
    // Repair successful
    return {
      ok: true,
      final_text: repairedText,
      blocked: false,
      repaired: true,
      phrase_filter: buildPhraseFilterOutcome(repairedPhraseFilterResult),
      validator: buildValidatorOutcome(repairedValidatorResult, true),
    };
  }

  // Step 6: Repair failed - return validator fallback
  // No more retries - fail closed
  return {
    ok: false,
    final_text: buildValidatorFallback(meta),
    blocked: false,
    repaired: true,
    phrase_filter: buildPhraseFilterOutcome(repairedPhraseFilterResult),
    validator: buildValidatorOutcome(repairedValidatorResult, true),
  };
}

/**
 * Build audit log entry for the safety pipeline
 * 
 * @param result - The safety pipeline result
 * @returns Audit entry to merge into request_context
 */
export function buildSafetyAuditEntry(result: SafetyPipelineResult): SafetyAuditEntry {
  return {
    ask_viv_safety: {
      phrase_filter: result.phrase_filter,
      validator: result.validator,
      pipeline: {
        blocked: result.blocked,
        repaired: result.repaired,
        version: PIPELINE_VERSION,
      },
    },
  };
}

/**
 * Extract safety information for explain panel
 * 
 * @param result - The safety pipeline result
 * @returns Safety object for explain payload
 */
export function extractExplainSafety(result: SafetyPipelineResult): {
  phrase_filter: PhraseFilterOutcome;
  validator: ValidatorOutcome;
} {
  return {
    phrase_filter: result.phrase_filter,
    validator: result.validator,
  };
}
