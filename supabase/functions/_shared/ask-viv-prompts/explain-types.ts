/**
 * Ask Viv Explain Types
 * 
 * Types for the "Explain sources" feature that reveals how Ask Viv
 * formed an answer. CSC review only, Vivacity internal only.
 */

import { type AskVivMode } from "./types.ts";
import { type PhraseFilterResult, PHRASE_FILTER_VERSION } from "./phrase-filter.ts";
import { type ValidationResult, RESPONSE_VALIDATOR_VERSION } from "./response-validator-v2.ts";
import { type SafetyPipelineResult } from "./askVivSafetyPipeline.ts";

/**
 * Fact preview for explain panel - safe, small previews only
 */
export interface FactPreview {
  key: string;
  value_preview: string;  // Max 120 chars, no PII
  source_table: string;
  source_ids_count: number;
}

/**
 * Record reference for explain panel
 */
export interface ExplainRecordRef {
  table: string;
  id: string;
  label: string;
  path?: string;
}

/**
 * Context snapshot for explain panel
 */
export interface ExplainContext {
  tenant_id: string | number;
  scope: {
    client_id: string | null;
    package_id: string | null;
    phase_id: string | null;
  };
  role: string;
  derived_at: string;  // ISO timestamp
}

/**
 * Safety checks summary for explain panel
 */
export interface ExplainSafety {
  phrase_filter: {
    blocked: boolean;
    matches: string[];
    categories: string[];
    version: string;
  };
  validator: {
    ok: boolean;
    errors: string[];
    repaired: boolean;
    version: string;
  };
}

/**
 * Full explain object for compliance response
 */
export interface ExplainPayload {
  context: ExplainContext;
  tables_queried: string[];
  records_used: ExplainRecordRef[];
  facts_used: FactPreview[];
  gaps: string[];
  safety: ExplainSafety;
}

/**
 * Build fact previews from derived facts
 * Ensures no raw data exposure - only safe previews
 */
export function buildFactPreviews(facts: Array<{ key: string; value: unknown; source_ids?: string[] }>): FactPreview[] {
  return facts.map(fact => {
    // Create safe preview - max 120 chars, no PII
    let valuePreview: string;
    const val = fact.value;
    
    if (typeof val === "string") {
      valuePreview = val.length > 120 ? val.substring(0, 117) + "..." : val;
    } else if (typeof val === "number" || typeof val === "boolean") {
      valuePreview = String(val);
    } else if (val === null || val === undefined) {
      valuePreview = "null";
    } else if (Array.isArray(val)) {
      valuePreview = `[array of ${val.length} items]`;
    } else if (typeof val === "object") {
      // For objects, show key count or specific safe fields
      const keys = Object.keys(val);
      if (keys.length <= 3) {
        const preview = JSON.stringify(val);
        valuePreview = preview.length > 120 ? preview.substring(0, 117) + "..." : preview;
      } else {
        valuePreview = `{object with ${keys.length} keys}`;
      }
    } else {
      valuePreview = "[complex value]";
    }

    // Infer source table from fact key
    const sourceTable = inferSourceTable(fact.key);
    
    return {
      key: fact.key,
      value_preview: valuePreview,
      source_table: sourceTable,
      source_ids_count: fact.source_ids?.length || 0,
    };
  });
}

/**
 * Infer source table from fact key naming convention
 */
function inferSourceTable(factKey: string): string {
  const tablePatterns: Record<string, string> = {
    "tenant_": "tenants",
    "client_": "clients",
    "package_": "packages",
    "phase_": "documents_stages",
    "task_": "phase_tasks",
    "document_": "documents",
    "consult_": "consult_logs",
    "evidence_": "documents",
    "risk_": "tenants",
  };

  for (const [prefix, table] of Object.entries(tablePatterns)) {
    if (factKey.startsWith(prefix)) {
      return table;
    }
  }
  
  return "derived";
}

/**
 * Build safety summary from phrase filter and validator results
 */
export function buildExplainSafety(
  phraseFilterResult?: PhraseFilterResult | null,
  validatorResult?: ValidationResult | null,
  repaired?: boolean
): ExplainSafety {
  return {
    phrase_filter: {
      blocked: phraseFilterResult?.blocked ?? false,
      matches: phraseFilterResult?.matches ?? [],
      categories: phraseFilterResult?.categories ?? [],
      version: PHRASE_FILTER_VERSION,
    },
    validator: {
      ok: validatorResult?.ok ?? true,
      errors: validatorResult?.errors ?? [],
      repaired: repaired ?? false,
      version: RESPONSE_VALIDATOR_VERSION,
    },
  };
}

/**
 * Build safety summary directly from safety pipeline result
 * Preferred method when using the unified safety pipeline
 */
export function buildExplainSafetyFromPipeline(result: SafetyPipelineResult): ExplainSafety {
  return {
    phrase_filter: result.phrase_filter,
    validator: result.validator,
  };
}

/**
 * Build full explain payload from fact builder and safety results
 */
export function buildExplainPayload(
  tenantId: string | number,
  scope: { client_id?: string | null; package_id?: string | null; phase_id?: string | null },
  role: string,
  tablesQueried: string[],
  recordsUsed: ExplainRecordRef[],
  facts: Array<{ key: string; value: unknown; source_ids?: string[] }>,
  gaps: string[],
  phraseFilterResult?: PhraseFilterResult | null,
  validatorResult?: ValidationResult | null,
  repaired?: boolean
): ExplainPayload {
  return {
    context: {
      tenant_id: tenantId,
      scope: {
        client_id: scope.client_id || null,
        package_id: scope.package_id || null,
        phase_id: scope.phase_id || null,
      },
      role,
      derived_at: new Date().toISOString(),
    },
    tables_queried: tablesQueried,
    records_used: recordsUsed,
    facts_used: buildFactPreviews(facts),
    gaps,
    safety: buildExplainSafety(phraseFilterResult, validatorResult, repaired),
  };
}
