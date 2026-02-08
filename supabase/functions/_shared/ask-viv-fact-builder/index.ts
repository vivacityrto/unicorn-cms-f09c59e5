/**
 * Ask Viv Fact Builder Service
 * 
 * Main entry point for the deterministic Fact Builder.
 * Assembles a tenant-scoped state snapshot for Ask Viv.
 * Read-only. Audit-safe. Traceable to source records.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

import type {
  AskVivFactBuilderInput,
  AskVivFactsResult,
  FactBuilderContext,
  DerivedFact,
  FactBuilderAudit,
} from "./types.ts";

import { validateInput, sanitizeScope } from "./validation.ts";
import { retrieveFactData } from "./data-retrieval.ts";
import { inferScope } from "./scope-inference.ts";
import {
  deriveTenantFacts,
  deriveClientFacts,
  derivePackageFacts,
  derivePhaseFacts,
  deriveTaskFacts,
  deriveEvidenceFacts,
  deriveConsultFacts,
  derivePhaseBlockers,
} from "./fact-derivation.ts";
import { buildRecordLinks, deduplicateLinks } from "./record-links.ts";

export * from "./types.ts";

/**
 * Build Ask Viv facts from input.
 * 
 * @param supabase - Supabase client (service role)
 * @param input - Validated input parameters
 * @returns Structured facts result with audit trail
 */
export async function buildAskVivFacts(
  supabase: SupabaseClient,
  input: AskVivFactBuilderInput
): Promise<AskVivFactsResult> {
  const startTime = Date.now();
  
  // 1. Validate input
  const validation = validateInput(input);
  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.error}`);
  }

  // 2. Sanitize scope
  const sanitizedScope = sanitizeScope(input.scope);

  // 3. Retrieve data
  const data = await retrieveFactData(supabase, input.tenant_id, sanitizedScope);

  // 4. Handle missing tenant
  if (!data.tenant) {
    return {
      context: buildContext(input, sanitizedScope),
      facts: [],
      record_links: [],
      gaps: ["Tenant not found or access denied"],
      audit: buildAudit(data.tables_queried, data.record_ids, [], startTime),
    };
  }

  // 5. Infer scope
  const inference = inferScope(
    sanitizedScope,
    data.packages,
    data.phases,
    input.tenant_id
  );

  // 6. Derive all facts
  const facts: DerivedFact[] = [];
  const gaps: string[] = [...inference.gaps];

  // Tenant facts
  const tenantFacts = deriveTenantFacts(data.tenant, input.now_iso);
  facts.push(...tenantFacts);

  // Client facts (tenant as client)
  const clientFacts = deriveClientFacts(data.tenant, input.now_iso);
  facts.push(...clientFacts);

  // Package facts
  if (data.packages.length > 0) {
    const packageFacts = derivePackageFacts(data.packages, input.now_iso);
    facts.push(...packageFacts);
  } else {
    gaps.push("No packages found for this tenant");
  }

  // Phase facts
  if (data.phases.length > 0) {
    const phaseFacts = derivePhaseFacts(data.phases, data.tasks, input.now_iso);
    facts.push(...phaseFacts);
  } else {
    gaps.push("No phases/stages found for this tenant");
  }

  // Task facts
  if (data.tasks.length > 0) {
    const taskFacts = deriveTaskFacts(data.tasks, input.now_iso);
    facts.push(...taskFacts);
  } else {
    gaps.push("No tasks found");
  }

  // Evidence facts
  if (data.evidence.length > 0) {
    const evidenceFacts = deriveEvidenceFacts(data.evidence, input.now_iso);
    facts.push(...evidenceFacts);
  } else {
    gaps.push("No documents/evidence found for this tenant");
  }

  // Consult facts
  const consultFacts = deriveConsultFacts(data.consults, input.now_iso);
  facts.push(...consultFacts);

  // Phase blockers (derived fact)
  const { fact: blockerFact } = derivePhaseBlockers(
    data.tasks,
    data.evidence,
    data.packages,
    input.now_iso
  );
  if (blockerFact) {
    facts.push(blockerFact);
  }

  // 7. Build record links
  const rawLinks = buildRecordLinks(data.record_ids, inference.scope);
  const recordLinks = deduplicateLinks(rawLinks);

  // 8. Build audit trail
  const audit = buildAudit(
    data.tables_queried,
    data.record_ids,
    inference.decisions,
    startTime
  );

  // 9. Build final result
  return {
    context: buildContext(input, inference.scope),
    facts,
    record_links: recordLinks,
    gaps,
    audit,
  };
}

/**
 * Build context object for result.
 */
function buildContext(
  input: AskVivFactBuilderInput,
  scope: {
    client_id: string | null;
    package_id: string | null;
    phase_id: string | null;
  }
): FactBuilderContext {
  return {
    user_id: input.user_id,
    tenant_id: input.tenant_id,
    role: input.role,
    scope,
    now_iso: input.now_iso,
    timezone: input.timezone,
  };
}

/**
 * Build audit trail object.
 */
function buildAudit(
  tablesQueried: string[],
  recordIds: { table: string; ids: string[] }[],
  decisions: { field: string; action: string; reason: string }[],
  startTime: number
): FactBuilderAudit {
  return {
    tables_queried: tablesQueried,
    record_ids_accessed: recordIds,
    inference_decisions: decisions.map(d => ({
      field: d.field,
      action: d.action as "inferred" | "skipped" | "multiple_candidates",
      reason: d.reason,
    })),
    query_timestamp: new Date().toISOString(),
    duration_ms: Date.now() - startTime,
  };
}

/**
 * Convert facts to records_accessed format for logging.
 */
export function factsToRecordsAccessed(
  facts: DerivedFact[]
): { table: string; id: string; label: string }[] {
  const records: { table: string; id: string; label: string }[] = [];
  const seen = new Set<string>();

  for (const fact of facts) {
    for (const id of fact.source_ids) {
      const key = `${fact.source_table}:${id}`;
      if (!seen.has(key)) {
        seen.add(key);
        records.push({
          table: fact.source_table,
          id,
          label: fact.key,
        });
      }
    }
  }

  return records;
}

/**
 * Format facts for LLM consumption.
 * Returns a clean, structured summary without raw data.
 */
export function formatFactsForLLM(facts: DerivedFact[]): string {
  const lines: string[] = [];
  
  // Group facts by key prefix
  const grouped = new Map<string, DerivedFact[]>();
  for (const fact of facts) {
    const prefix = fact.key.split("_")[0];
    const existing = grouped.get(prefix) || [];
    existing.push(fact);
    grouped.set(prefix, existing);
  }

  for (const [category, categoryFacts] of grouped) {
    lines.push(`## ${category.charAt(0).toUpperCase() + category.slice(1)} Facts`);
    
    for (const fact of categoryFacts) {
      const valueStr = typeof fact.value === "object" 
        ? JSON.stringify(fact.value) 
        : String(fact.value);
      
      lines.push(`- **${fact.key}**: ${valueStr}`);
      if (fact.reason) {
        lines.push(`  - Reason: ${fact.reason}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}
