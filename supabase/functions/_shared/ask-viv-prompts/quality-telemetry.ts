/**
 * Ask Viv Quality Telemetry
 * 
 * Writes internal-only telemetry events for Ask Viv to support tuning and governance.
 * No prompt/response content is stored. Aggregate-first design.
 * 
 * Tracks:
 * - Blocks by category
 * - Repairs triggered
 * - Confidence distribution
 * - Most common gaps (standardised keys only)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mapGapsToKeys, type StandardGapKey, GAP_KEY_MAPPER_VERSION } from "./gap-key-mapper.ts";

/**
 * Version for audit tracking
 */
export const QUALITY_TELEMETRY_VERSION = "v1";

/**
 * Block category identifiers for telemetry
 */
export type BlockCategory =
  | "intent_decision_request"
  | "intent_out_of_scope"
  | "phrase_filter_regulatory_action"
  | "phrase_filter_phase_bypass"
  | "phrase_filter_compliance_claim"
  | "validator_fallback";

/**
 * Input for writing a quality event
 */
export interface QualityEventInput {
  user_id: string;
  tenant_id?: number | null;
  mode: "knowledge" | "compliance";
  intent?: string | null;
  blocked: boolean;
  block_categories: BlockCategory[];
  repaired: boolean;
  confidence?: "High" | "Medium" | "Low" | null;
  gaps?: string[];
  ai_interaction_log_id?: string | null;
  meta?: QualityEventMeta;
}

/**
 * Metadata stored in the meta JSONB column
 * Keep this small - no prompt/response content
 */
export interface QualityEventMeta {
  // Version tracking
  intent_version?: string;
  phrase_filter_version?: string;
  validator_version?: string;
  gap_mapper_version?: string;
  telemetry_version?: string;

  // Freshness status
  freshness_status?: "fresh" | "aging" | "stale";
  freshness_days?: number;
  confidence_downgraded?: boolean;

  // Scope inference
  scope_inferred?: boolean;
  scope_source?: string;

  // Repair details (no content)
  repair_error_count?: number;
}

/**
 * Map phrase filter categories to block categories
 */
export function mapPhraseFilterCategories(categories: string[]): BlockCategory[] {
  const mapping: Record<string, BlockCategory> = {
    regulatory_action: "phrase_filter_regulatory_action",
    phase_bypass: "phrase_filter_phase_bypass",
    deterministic_compliance: "phrase_filter_compliance_claim",
  };

  return categories
    .map((cat) => mapping[cat])
    .filter((cat): cat is BlockCategory => cat !== undefined);
}

/**
 * Map intent classification to block category
 */
export function mapIntentToBlockCategory(intent: string): BlockCategory | null {
  const mapping: Record<string, BlockCategory> = {
    decision_request: "intent_decision_request",
    out_of_scope: "intent_out_of_scope",
  };

  return mapping[intent] || null;
}

/**
 * Build block categories from pipeline results
 */
export function buildBlockCategories(params: {
  intentBlocked?: boolean;
  intent?: string | null;
  phraseFilterBlocked?: boolean;
  phraseFilterCategories?: string[];
  validatorFallback?: boolean;
}): BlockCategory[] {
  const categories: BlockCategory[] = [];

  // Intent-based blocks
  if (params.intentBlocked && params.intent) {
    const intentCategory = mapIntentToBlockCategory(params.intent);
    if (intentCategory) {
      categories.push(intentCategory);
    }
  }

  // Phrase filter blocks
  if (params.phraseFilterBlocked && params.phraseFilterCategories) {
    categories.push(...mapPhraseFilterCategories(params.phraseFilterCategories));
  }

  // Validator fallback
  if (params.validatorFallback) {
    categories.push("validator_fallback");
  }

  return categories;
}

/**
 * Write a quality telemetry event
 * 
 * Call this once per Ask Viv response, after pipeline decision is final,
 * before returning to UI.
 * 
 * @param supabaseUrl - Supabase URL
 * @param supabaseServiceKey - Supabase service role key (for insert)
 * @param input - Event data
 */
export async function writeAiQualityEvent(
  supabaseUrl: string,
  supabaseServiceKey: string,
  input: QualityEventInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Map free-text gaps to standardised keys
    const gapKeys: StandardGapKey[] = input.gaps ? mapGapsToKeys(input.gaps) : [];

    // Enrich meta with version info
    const meta: QualityEventMeta = {
      ...input.meta,
      gap_mapper_version: GAP_KEY_MAPPER_VERSION,
      telemetry_version: QUALITY_TELEMETRY_VERSION,
    };

    const { error } = await supabase.from("ai_quality_events").insert({
      user_id: input.user_id,
      tenant_id: input.tenant_id ?? null,
      mode: input.mode,
      intent: input.intent ?? null,
      blocked: input.blocked,
      block_categories: input.block_categories,
      repaired: input.repaired,
      confidence: input.confidence ?? null,
      gap_keys: gapKeys,
      ai_interaction_log_id: input.ai_interaction_log_id ?? null,
      meta,
    });

    if (error) {
      console.error("[QualityTelemetry] Insert failed:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("[QualityTelemetry] Exception:", errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Helper to build meta from pipeline results
 */
export function buildQualityEventMeta(params: {
  intentVersion?: string;
  phraseFilterVersion?: string;
  validatorVersion?: string;
  freshnessStatus?: "fresh" | "aging" | "stale";
  freshnessDays?: number;
  confidenceDowngraded?: boolean;
  scopeInferred?: boolean;
  scopeSource?: string;
  repairErrorCount?: number;
}): QualityEventMeta {
  return {
    intent_version: params.intentVersion,
    phrase_filter_version: params.phraseFilterVersion,
    validator_version: params.validatorVersion,
    freshness_status: params.freshnessStatus,
    freshness_days: params.freshnessDays,
    confidence_downgraded: params.confidenceDowngraded,
    scope_inferred: params.scopeInferred,
    scope_source: params.scopeSource,
    repair_error_count: params.repairErrorCount,
  };
}
