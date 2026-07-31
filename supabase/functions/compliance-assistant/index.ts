/**
 * Compliance Assistant Edge Function
 * 
 * V4: Integrated with Ask Viv Fact Builder and Tiered Prompt System.
 * Uses deterministic facts, tiered reasoning, and governance controls.
 * Read-only, audit-safe, respects RLS and roles.
 * 
 * Key changes in V4:
 * - Uses buildAskVivFacts() as the ONLY source of facts
 * - No raw DB results passed to LLM
 * - Full audit trail with records_accessed
 * - Scope inference for missing IDs
 * - Tiered prompt system with validation
 * - Response validation for banned phrases and required sections
 */

import { createServiceClient } from "../_shared/supabase-client.ts";
import { extractToken, verifyAuth, checkVivacityTeam, checkSuperAdmin, UserProfile } from "../_shared/auth-helpers.ts";
import { jsonOk, jsonError, jsonRaw } from "../_shared/response-helpers.ts";
import { validateAskVivAccess, askVivAccessDeniedResponse } from "../_shared/ask-viv-access.ts";
import { generateEmbedding as generateEmbeddingShared } from "../_shared/openai-embeddings.ts";

// AI Brain imports (for reasoning engine)
import {
  processAIBrainInput,
  buildSourceCitations,
  buildGovernanceInfo,
  formatEscalationsForPrompt,
  type AIContext,
  type FactSet,
  type ReasoningOutput,
  type ConfidenceResult,
  type DataForFacts,
  type ClientData,
  type PackageData,
  type PhaseData,
  type TaskData,
  type EvidenceData,
  type RiskData,
} from "../_shared/ai-brain/index.ts";

// Fact Builder imports (V3)
import {
  buildAskVivFacts,
  factsToRecordsAccessed,
  formatFactsForLLM,
  type AskVivFactBuilderInput,
  type AskVivFactsResult,
  type DerivedFact,
} from "../_shared/ask-viv-fact-builder/index.ts";
import {
  buildScopeLock,
  type ScopeLock,
} from "../_shared/ask-viv-fact-builder/scope-lock.ts";
import {
  buildExplainPayload,
  type ExplainPayload,
} from "../_shared/ask-viv-prompts/explain-types.ts";

// V4: Tiered Prompt System imports
import {
  buildFullPrompt,
  buildPromptPack,
  validateResponse,
  sanitizeResponse,
  COMPLIANCE_SYSTEM_PROMPT,
  COMPLIANCE_DEVELOPER_PROMPT,
  GLOBAL_SYSTEM_PROMPT,
} from "../_shared/ask-viv-prompts/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": 
    "authorization, x-client-info, apikey, content-type, " +
    "x-supabase-client-platform, x-supabase-client-platform-version, " +
    "x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Types
interface RequestContext {
  tenant_id: number | null;
  client_id?: number | null;
  package_id?: number | null;
  phase_id?: number | null;
}

interface RequestPayload {
  question: string;
  context: RequestContext;
}

interface RecordAccessed {
  table: string;
  id: string | number;
  label: string;
}

interface VectorResult {
  id: string;
  source_type: string;        // outcome_standards | compliance_requirements | credential_policy | practice_guide | national_code | cricos_practice_guide | esos_act
  source_document: string;    // e.g. "Practice Guide - Assessment"
  framework: string;          // SRTO_2025 | NATIONAL_CODE_2018 | ESOS_ACT_2000
  clause: string | null;      // e.g. "1.5"
  chunk_index: number;
  heading: string | null;
  content: string;
  similarity: number;
}

/**
 * Build a human-readable citation label for a corpus chunk.
 * Use clause when available; otherwise fall back to chunk index.
 */
function citationLabel(vr: VectorResult): string {
  return vr.clause
    ? `${vr.source_document}, clause ${vr.clause}`
    : `${vr.source_document}, chunk ${vr.chunk_index}`;
}

interface ComplianceResponse {
  answer_markdown: string;
  records_accessed: RecordAccessed[];
  confidence: "high" | "medium" | "low";
  gaps: string[];
  chunks_used?: number;
  source_types_used?: string[];
  // V2: AI Brain additions
  reasoning_tiers?: {
    tier: string;
    finding_count: number;
    critical_count: number;
  }[];
  escalation_count?: number;
  governance?: {
    read_only: boolean;
    human_action_required: boolean;
    caution_banners: string[];
  };
  // V4: Validation metadata
  validation?: {
    valid: boolean;
    warnings: number;
    sanitized: boolean;
  };
}

// Main handler
Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonError(405, "METHOD_NOT_ALLOWED", "Only POST requests are accepted");
  }

  try {
    // Authenticate
    const token = extractToken(req);
    if (!token) {
      return jsonError(401, "UNAUTHORIZED", "No authorization token provided");
    }

    const supabase = createServiceClient();
    const { user, profile, error: authError } = await verifyAuth(supabase, token);
    
    if (authError || !user || !profile) {
      return jsonError(401, "UNAUTHORIZED", authError || "Authentication failed");
    }

    // Validate Ask Viv access - Vivacity internal only
    const accessCheck = await validateAskVivAccess(supabase, user.id, profile, "compliance-assistant");
    if (!accessCheck.allowed) {
      return askVivAccessDeniedResponse(accessCheck.reason);
    }

    // Parse request
    let payload: RequestPayload;
    try {
      payload = await req.json();
    } catch {
      return jsonError(400, "BAD_REQUEST", "Invalid JSON body");
    }

    const { question, context } = payload;
    
    if (!question || typeof question !== "string" || question.trim().length === 0) {
      return jsonError(400, "BAD_REQUEST", "Question is required");
    }

    // Validate tenant access
    const tenantId = context?.tenant_id;
    if (!tenantId) {
      return jsonError(400, "BAD_REQUEST", "tenant_id is required in context");
    }

    const hasAccess = await validateTenantAccess(supabase, user.id, profile, tenantId);
    if (!hasAccess) {
      return jsonError(403, "FORBIDDEN", "You do not have access to this tenant");
    }

    // Vector search uses OpenAI direct for embeddings (gateway no longer supports them).
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

    let vectorResults: VectorResult[] = [];
    if (OPENAI_API_KEY) {
      vectorResults = await performVectorSearch(
        supabase,
        tenantId,
        question,
      );
      console.log(`Vector search returned ${vectorResults.length} results`);
    } else {
      console.warn("OPENAI_API_KEY not set — skipping vector search");
    }

    // V3: Use Fact Builder service as the ONLY source of facts
    const factBuilderInput: AskVivFactBuilderInput = {
      user_id: user.id,
      tenant_id: tenantId,
      role: profile.unicorn_role || "unknown",
      scope: {
        client_id: context.client_id?.toString() || null,
        package_id: context.package_id?.toString() || null,
        phase_id: context.phase_id?.toString() || null,
      },
      now_iso: new Date().toISOString(),
      timezone: "Australia/Sydney",
      question: question,
    };

    let factsResult: AskVivFactsResult;
    try {
      factsResult = await buildAskVivFacts(supabase, factBuilderInput);
      console.log(`Fact Builder returned ${factsResult.facts.length} facts, ${factsResult.gaps.length} gaps`);
    } catch (factError) {
      console.error("Fact Builder error:", factError);
      return jsonError(500, "FACT_BUILDER_ERROR", "Failed to build facts for response");
    }

    // Convert facts to DataForFacts format for AI Brain compatibility
    const dataForFacts = convertFactsToDataForFacts(factsResult);
    
    // Process through AI Brain pipeline (for reasoning engine)
    const brainResult = processAIBrainInput({
      user: { id: user.id },
      profile,
      tenant: dataForFacts.client ? {
        id: tenantId,
        name: dataForFacts.client.name,
        status: dataForFacts.client.status,
        rto_id: dataForFacts.client.rto_id,
        risk_level: dataForFacts.client.risk_level,
      } : null,
      scope: {
        client_id: context.client_id,
        package_id: context.package_id,
        phase_id: context.phase_id,
      },
      data: dataForFacts,
    });

    // Generate answer using facts (not raw DB results)
    const response = generateFactBasedAnswer(
      question, 
      factsResult,
      brainResult,
      vectorResults,
      context
    );

    // V4 restore: build scope_lock from fact-builder result
    let scope_lock: ScopeLock | null = null;
    try {
      const resolvedScope = factsResult.context.scope;
      const tenantNameFact = factsResult.facts.find(f => f.key === "tenant_name");
      const tenantName = tenantNameFact ? String(tenantNameFact.value) : null;

      const findLabelForId = (prefix: string, id: string | null): string | null => {
        if (!id) return null;
        const fact = factsResult.facts.find(
          f => f.key.startsWith(prefix) && f.source_ids.includes(id)
        );
        if (!fact) return null;
        if (typeof fact.value === "string") return fact.value;
        if (fact.value && typeof fact.value === "object") {
          const v = fact.value as Record<string, unknown>;
          if (typeof v.name === "string") return v.name;
          if (typeof v.label === "string") return v.label;
          if (typeof v.title === "string") return v.title;
        }
        return fact.reason ?? null;
      };

      const packageLabel = findLabelForId("package_", resolvedScope.package_id);
      const phaseLabel = findLabelForId("phase_", resolvedScope.phase_id);

      const hasAnyScope =
        !!resolvedScope.client_id ||
        !!resolvedScope.package_id ||
        !!resolvedScope.phase_id ||
        !!tenantName;

      if (hasAnyScope) {
        scope_lock = buildScopeLock({
          tenantId,
          tenantName,
          providedScope: {
            client_id: context.client_id?.toString() ?? null,
            package_id: context.package_id?.toString() ?? null,
            phase_id: context.phase_id?.toString() ?? null,
          },
          resolvedScope,
          decisions: factsResult.audit.inference_decisions,
          labels: {
            client_label: tenantName,
            package_label: packageLabel,
            phase_label: phaseLabel,
          },
        });
      }
    } catch (slErr) {
      console.warn("V4: scope_lock derivation failed:", slErr);
      scope_lock = null;
    }

    // V4 restore: derive freshness from latest activity for tenant
    let freshness: {
      last_activity_at: string | null;
      days_since_activity: number | null;
      status: "fresh" | "aging" | "stale";
      derived_at: string;
    } | null = null;
    try {
      // Ladder of tenant-scoped activity sources, most to least direct.
      // The previous version queried audit_events.tenant_id (a column that
      // doesn't exist on that table at all — it's keyed by generic
      // entity/entity_id, not tenant) and tasks.tenant_id (a column that
      // doesn't exist on that table either — see the Phase 1 fact-source
      // correction notes on `tasks` vs `tasks_tenants`). Both silently failed
      // via this try/catch, every time, for every tenant — freshness has
      // effectively never worked.
      let lastActivityAt: string | null = null;

      let taskQuery = supabase
        .from("tasks_tenants")
        .select("updated_at")
        .eq("tenant_id", tenantId)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (context.package_id) {
        taskQuery = taskQuery.eq("package_id", context.package_id);
      }
      const { data: taskRow } = await taskQuery.maybeSingle();
      lastActivityAt = taskRow?.updated_at ?? null;

      if (!lastActivityAt) {
        let timeQuery = supabase
          .from("time_entries")
          .select("start_at")
          .eq("client_id", tenantId)
          .order("start_at", { ascending: false })
          .limit(1);
        if (context.package_id) {
          timeQuery = timeQuery.eq("package_id", context.package_id);
        }
        const { data: timeRow } = await timeQuery.maybeSingle();
        lastActivityAt = timeRow?.start_at ?? null;
      }

      if (!lastActivityAt) {
        let stageQuery = supabase
          .from("client_package_stage_state")
          .select("updated_at")
          .eq("tenant_id", tenantId)
          .order("updated_at", { ascending: false })
          .limit(1);
        if (context.package_id) {
          stageQuery = stageQuery.eq("package_id", context.package_id);
        }
        const { data: stageRow } = await stageQuery.maybeSingle();
        lastActivityAt = stageRow?.updated_at ?? null;
      }

      const days = lastActivityAt
        ? Math.floor((Date.now() - new Date(lastActivityAt).getTime()) / 86_400_000)
        : null;
      const status: "fresh" | "aging" | "stale" =
        days === null ? "stale" : days <= 14 ? "fresh" : days <= 30 ? "aging" : "stale";

      freshness = {
        last_activity_at: lastActivityAt,
        days_since_activity: days,
        status,
        derived_at: new Date().toISOString(),
      };
    } catch (fErr) {
      console.warn("V4: freshness derivation failed:", fErr);
      freshness = null;
    }

    // V4 restore: build explain payload from data already computed
    let explain: ExplainPayload | null = null;
    try {
      const safetyMeta = (response as { safety_meta?: { validation: unknown; modifications: string[] } }).safety_meta;
      explain = buildExplainPayload(
        tenantId,
        {
          client_id: factsResult.context.scope.client_id,
          package_id: factsResult.context.scope.package_id,
          phase_id: factsResult.context.scope.phase_id,
        },
        profile.unicorn_role || "unknown",
        Array.from(new Set([
          ...factsResult.audit.tables_queried,
          ...(response.source_types_used ?? []),
        ])),
        response.records_accessed.map(r => ({
          table: r.table,
          id: String(r.id),
          label: r.label,
        })),
        factsResult.facts,
        factsResult.gaps,
        null,
        (safetyMeta?.validation ?? null) as Parameters<typeof buildExplainPayload>[8],
        (safetyMeta?.modifications?.length ?? 0) > 0,
      );
      if (freshness) {
        explain.freshness = {
          last_activity_at: freshness.last_activity_at,
          days_since_activity: freshness.days_since_activity,
          status: freshness.status,
          confidence_downgraded: false,
        };
      }
    } catch (eErr) {
      console.warn("V4: explain payload derivation failed:", eErr);
      explain = null;
    }

    // Log interaction with enhanced audit trail
    const aiInteractionLogId = await logInteraction(
      supabase, 
      user.id, 
      tenantId, 
      profile, 
      question, 
      response, 
      context,
      factsResult,
      brainResult
    );

    // Strip internal safety_meta before returning to client
    const { safety_meta: _safetyMeta, ...responseClean } = response as typeof response & { safety_meta?: unknown };
    return jsonRaw({ ...responseClean, scope_lock, freshness, explain, ai_interaction_log_id: aiInteractionLogId });

  } catch (err) {
    console.error("Compliance assistant error:", err);
    return jsonError(500, "INTERNAL_ERROR", "An unexpected error occurred");
  }
});

/**
 * Validate that the user has access to the specified tenant
 */
async function validateTenantAccess(
  supabase: any,
  userId: string,
  profile: UserProfile,
  tenantId: number
): Promise<boolean> {
  // SuperAdmins and Vivacity Team have access to all tenants
  if (checkSuperAdmin(profile) || checkVivacityTeam(profile)) {
    return true;
  }

  // Check tenant_members for client users
  const { data } = await supabase
    .from("tenant_members")
    .select("id")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .limit(1)
    .single();

  return !!data;
}

/**
 * Perform vector search for the question
 */
async function performVectorSearch(
  supabase: any,
  tenantId: number,
  query: string,
): Promise<VectorResult[]> {
  try {
    // Generate query embedding via OpenAI direct (Lovable gateway does not support embeddings)
    let queryEmbedding: number[];
    try {
      queryEmbedding = await generateEmbeddingShared(query);
    } catch (err) {
      console.error("Embedding generation failed:", err);
      return [];
    }

    // Search the SRTO corpus (global reference content; not tenant-scoped).
    // tenantId is unused for srto_corpus but kept on the helper signature for caller stability.
    void tenantId;
    const { data: results, error } = await supabase.rpc("match_srto_chunks", {
      query_embedding: queryEmbedding,
      match_threshold: 0.5,
      match_count: 6,
      filter_source_type: null,
      filter_framework: null,
      filter_clause: null,
    });

    if (error) {
      console.error("Vector search error:", error);
      return [];
    }

    return (results || []).map((r: any) => ({
      id: r.id,
      source_type: r.source_type,
      source_document: r.source_document,
      framework: r.framework,
      clause: r.clause ?? null,
      chunk_index: r.chunk_index,
      heading: r.heading ?? null,
      content: r.content,
      similarity: r.similarity,
    }));
  } catch (err) {
    console.error("Vector search failed:", err);
    return [];
  }
}

/**
 * V3: Convert AskVivFactsResult to DataForFacts format for AI Brain compatibility
 */
function convertFactsToDataForFacts(factsResult: AskVivFactsResult): DataForFacts {
  // Extract tenant/client info from facts
  const tenantNameFact = factsResult.facts.find(f => f.key === "tenant_name");
  const tenantStatusFact = factsResult.facts.find(f => f.key === "tenant_status");
  const rtoIdFact = factsResult.facts.find(f => f.key === "tenant_rto_id");
  const riskLevelFact = factsResult.facts.find(f => f.key === "tenant_risk_level");

  const client: ClientData | undefined = tenantNameFact ? {
    id: factsResult.context.tenant_id,
    name: String(tenantNameFact.value),
    status: String(tenantStatusFact?.value || "unknown"),
    rto_id: rtoIdFact ? String(rtoIdFact.value) : null,
    risk_level: riskLevelFact ? String(riskLevelFact.value) : null,
  } : undefined;

  // Extract packages from facts
  const packageFacts = factsResult.facts.filter(f => f.key === "package_status");
  const packages: PackageData[] = packageFacts.map(f => {
    const val = f.value as { id: number; name: string; status: string; type?: string };
    return {
      id: val.id,
      name: val.name,
      status: val.status,
      package_type: val.type,
    };
  });

  // Extract phases from facts
  const phaseFacts = factsResult.facts.filter(f => f.key === "phase_status");
  const phases: PhaseData[] = phaseFacts.map(f => {
    const val = f.value as { id: number; title: string; status: string; stage_type?: string };
    return {
      id: val.id,
      title: val.title,
      status: val.status,
      stage_type: val.stage_type,
    };
  });

  // We don't expose raw task/evidence data - only derived facts
  const tasks: TaskData[] = [];
  const evidence: EvidenceData[] = [];
  const risks: RiskData[] = [];

  return {
    client,
    packages,
    phases,
    tasks,
    evidence,
    risks,
  };
}

/**
 * V4: Generate answer using Fact Builder results with tiered prompt system
 * Uses derived facts only - never raw DB rows
 * Validates response against tier compliance rules
 */
function generateFactBasedAnswer(
  question: string,
  factsResult: AskVivFactsResult,
  brainResult: {
    context: AIContext;
    factSet: FactSet;
    reasoning: ReasoningOutput;
    confidence: ConfidenceResult;
    contextPrompt: string;
    factsPrompt: string;
    reasoningPrompt: string;
  },
  vectorResults: VectorResult[],
  context: RequestContext
): ComplianceResponse {
  const gaps: string[] = [...factsResult.gaps];
  const bullets: string[] = [];
  const sourceTypesUsed = new Set<string>();
  
  const q = question.toLowerCase();

  // V4: Build the full tier-enforced prompt for logging/debug
  const fullPrompt = buildFullPrompt("compliance", {
    facts: factsResult.facts,
    record_links: factsResult.record_links,
    gaps: factsResult.gaps,
    question: question,
  });
  console.log("V4: Using tier-enforced prompt system");
  const { reasoning, confidence } = brainResult;

  // Build governance info
  const governance = buildGovernanceInfo(confidence, reasoning.escalation_triggers);

  // Add caution banner if needed
  if (governance.caution_banners.length > 0) {
    bullets.push(...governance.caution_banners.map(b => `**${b}**`));
    bullets.push("");
  }

  // V3: Use facts from Fact Builder for tenant context
  const tenantNameFact = factsResult.facts.find(f => f.key === "tenant_name");
  const tenantStatusFact = factsResult.facts.find(f => f.key === "tenant_status");
  const rtoIdFact = factsResult.facts.find(f => f.key === "tenant_rto_id");
  const riskLevelFact = factsResult.facts.find(f => f.key === "tenant_risk_level");

  if (tenantNameFact) {
    bullets.push(`**Tenant:** ${tenantNameFact.value}`);
    if (tenantStatusFact) bullets.push(`**Status:** ${tenantStatusFact.value}`);
    if (rtoIdFact) bullets.push(`**RTO ID:** ${rtoIdFact.value}`);
    if (riskLevelFact) bullets.push(`**Risk Level:** ${riskLevelFact.value}`);
    bullets.push("");
  }

  // Include vector results if available
  if (vectorResults.length > 0) {
    bullets.push("**Relevant Context (indexed):**");
    const bySource = new Map<string, VectorResult[]>();
    for (const vr of vectorResults.slice(0, 5)) {
      const existing = bySource.get(vr.source_type) || [];
      existing.push(vr);
      bySource.set(vr.source_type, existing);
      sourceTypesUsed.add(vr.source_type);
    }

    for (const [sourceType, results] of bySource) {
      const sourceLabel = sourceType.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
      bullets.push(`*${sourceLabel}:*`);
      for (const r of results) {
        bullets.push(`- ${citationLabel(r)}: ${r.content.slice(0, 160)}...`);
      }
    }
    bullets.push("");
  }

  // V3: Use derived facts for status/summary
  if (q.includes("status") || q.includes("overview") || q.includes("summary")) {
    bullets.push("**Current Status:**");
    
    // Package status from facts
    const packageCountFact = factsResult.facts.find(f => f.key === "package_count");
    if (packageCountFact) {
      const val = packageCountFact.value as { total: number; active: number };
      bullets.push(`- ${val.total} packages (${val.active} active)`);
    }

    // Task status from facts
    const incompleteTasksFact = factsResult.facts.find(f => f.key === "tasks_incomplete_count");
    const overdueTasksFact = factsResult.facts.find(f => f.key === "tasks_overdue_count");
    if (incompleteTasksFact) {
      bullets.push(`- ${incompleteTasksFact.value} incomplete tasks`);
    }
    if (overdueTasksFact && (overdueTasksFact.value as number) > 0) {
      bullets.push(`- ⚠️ ${overdueTasksFact.value} overdue tasks`);
    }

    // Evidence status from facts
    const unreleasedFact = factsResult.facts.find(f => f.key === "evidence_unreleased_count");
    if (unreleasedFact) {
      bullets.push(`- ${unreleasedFact.value} documents pending release`);
    }

    // Time logged from facts (time_entries — see Phase 1 fact-source
    // correction notes; previously read consult_logs, a table confirmed
    // completely empty in production)
    const timeHoursFact = factsResult.facts.find(f => f.key === "time_hours_30d");
    const timeCountFact = factsResult.facts.find(f => f.key === "time_entry_count_30d");
    if (timeHoursFact) {
      bullets.push(`- ${timeHoursFact.value}h logged (last 30 days)`);
    }
    if (timeCountFact) {
      bullets.push(`- ${timeCountFact.value} time entries`);
    }

    bullets.push("");
  }

  // V3: Use phase_blockers fact for blockers
  if (q.includes("blocker") || q.includes("block") || q.includes("stuck")) {
    bullets.push("**Blockers:**");
    const blockerFact = factsResult.facts.find(f => f.key === "phase_blockers");
    
    if (blockerFact && Array.isArray(blockerFact.value)) {
      const blockers = blockerFact.value as Array<{ type: string; label: string; count: number }>;
      for (const blocker of blockers) {
        const icon = blocker.type === "hours_exceeded" ? "🔴" : "⚠️";
        bullets.push(`${icon} ${blocker.label} (${blocker.count})`);
      }
    } else {
      bullets.push("✅ No active blockers detected");
    }
    bullets.push("");
  }

  // Risk assessment from reasoning engine
  if (q.includes("risk") || q.includes("audit") || q.includes("compliance")) {
    bullets.push("**Risk Assessment:**");
    const riskTier = reasoning.tiers.find(t => t.tier === "risk");
    if (riskTier && riskTier.findings.length > 0) {
      for (const finding of riskTier.findings) {
        const icon = finding.severity === "critical" ? "🔴" : "⚠️";
        bullets.push(`${icon} ${finding.summary}`);
      }
    } else {
      bullets.push("✅ No elevated risk indicators");
    }
    bullets.push("");
  }

  // Next actions from reasoning engine
  if (q.includes("action") || q.includes("next") || q.includes("do")) {
    bullets.push("**Suggested Next Steps:**");
    
    // Use next due task from facts
    const nextTaskFact = factsResult.facts.find(f => f.key === "next_due_task");
    if (nextTaskFact) {
      const val = nextTaskFact.value as { label: string; due_date: string };
      bullets.push(`→ Complete "${val.label}" (due: ${val.due_date})`);
    }

    const actionTier = reasoning.tiers.find(t => t.tier === "actions");
    if (actionTier && actionTier.findings.length > 0) {
      for (const finding of actionTier.findings) {
        bullets.push(`→ ${finding.summary}`);
      }
    }
    
    if (!nextTaskFact && (!actionTier || actionTier.findings.length === 0)) {
      bullets.push("No immediate actions required");
    }
    bullets.push("");
  }

  // Add escalations if present
  if (reasoning.escalation_triggers.length > 0) {
    bullets.push("**⚠️ Escalation Alerts:**");
    for (const trigger of reasoning.escalation_triggers) {
      const icon = trigger.severity === "critical" ? "🚨" : "⚠️";
      bullets.push(`${icon} ${trigger.message}`);
      bullets.push(`  Action: ${trigger.suggested_action}`);
    }
    bullets.push("");
  }

  // Generic summary if no specific pattern matched
  if (bullets.length <= 6 && vectorResults.length === 0) {
    bullets.push("**Summary:**");
    bullets.push(reasoning.final_summary);
    
    // Add key facts summary
    bullets.push("");
    bullets.push("**Key Facts:**");
    const formattedFacts = formatFactsForLLM(factsResult.facts.slice(0, 10));
    bullets.push(formattedFacts);
    bullets.push("");
  }

  // Confidence and review reminders
  bullets.push(`*Confidence: ${confidence.level.toUpperCase()}*`);
  if (governance.review_reminders.length > 0) {
    for (const reminder of governance.review_reminders) {
      bullets.push(`📋 ${reminder}`);
    }
  }

  // Add inference decisions info if any
  if (factsResult.audit.inference_decisions.length > 0) {
    const inferred = factsResult.audit.inference_decisions.filter(d => d.action === "inferred");
    if (inferred.length > 0) {
      bullets.push(`*Scope inferred: ${inferred.map(d => d.field).join(", ")}*`);
    }
  }

  // Gaps from confidence and fact builder
  if (confidence.level !== "high") {
    gaps.push(confidence.explanation);
  }
  if (vectorResults.length === 0) {
    gaps.push("No indexed vector data - using live database only");
  }

  // V4: Build records from Fact Builder result (not raw DB)
  const records: RecordAccessed[] = factsToRecordsAccessed(factsResult.facts);

  // Add vector results to records
  for (const vr of vectorResults) {
    records.push({
      table: vr.source_type,
      id: vr.id,
      label: citationLabel(vr),
    });
  }

  // V4: Build tier-formatted response following required sections
  const responseMarkdown = buildTierFormattedResponse(
    bullets,
    records,
    confidence.level,
    gaps,
    reasoning
  );

  // V4: Validate response against tier compliance rules
  const validationResult = validateResponse(
    responseMarkdown,
    "compliance",
    records,
    gaps
  );

  if (!validationResult.valid) {
    console.warn("V4: Response validation warnings:", validationResult.errors);
  }

  // V4: Sanitize response to ensure no banned phrases slip through
  const { sanitized, modifications } = sanitizeResponse(responseMarkdown);
  if (modifications.length > 0) {
    console.log("V4: Response sanitized:", modifications);
  }

  return {
    answer_markdown: sanitized,
    records_accessed: records,
    confidence: confidence.level,
    gaps,
    chunks_used: vectorResults.length,
    source_types_used: Array.from(sourceTypesUsed),
    reasoning_tiers: reasoning.tiers.map(t => ({
      tier: t.tier,
      finding_count: t.findings.length,
      critical_count: t.findings.filter(f => f.severity === "critical").length,
    })),
    escalation_count: reasoning.escalation_triggers.length,
    governance: {
      read_only: true,
      human_action_required: governance.human_action_required,
      caution_banners: governance.caution_banners,
    },
    // V4: Add validation metadata
    validation: {
      valid: validationResult.valid,
      warnings: validationResult.warnings.length,
      sanitized: modifications.length > 0,
    },
    // Internal-only: stripped before returning to client; used to build explain payload
    safety_meta: {
      validation: validationResult,
      modifications,
    },
  };
}

/**
 * V4: Build tier-formatted response following required sections
 */
function buildTierFormattedResponse(
  answerBullets: string[],
  records: RecordAccessed[],
  confidence: "high" | "medium" | "low",
  gaps: string[],
  reasoning: ReasoningOutput
): string {
  const sections: string[] = [];

  // Section 1: Answer
  sections.push("## Answer");
  if (answerBullets.length > 0) {
    sections.push(answerBullets.slice(0, 8).join("\n")); // Max 8 bullets
  } else {
    sections.push("- No specific findings for this query");
  }
  sections.push("");

  // Section 2: Key records used
  sections.push("## Key records used");
  if (records.length > 0) {
    for (const r of records.slice(0, 10)) {
      sections.push(`- ${r.label} (${r.table}:${r.id})`);
    }
  } else {
    sections.push("- None");
  }
  sections.push("");

  // Section 3: Confidence
  sections.push("## Confidence");
  sections.push(`**${confidence.charAt(0).toUpperCase() + confidence.slice(1)}**`);
  // Add brief explanation based on level
  if (confidence === "high") {
    sections.push("Facts cover the question and gaps are minimal.");
  } else if (confidence === "medium") {
    sections.push("Partial facts available. Some gaps limit precision.");
  } else {
    sections.push("Significant gaps or ambiguity. Review source records.");
  }
  sections.push("");

  // Section 4: Gaps
  sections.push("## Gaps");
  if (gaps.length > 0) {
    for (const gap of gaps.slice(0, 5)) {
      sections.push(`- ${gap}`);
    }
  } else {
    sections.push("- None");
  }
  sections.push("");

  // Section 5: Next safe actions
  sections.push("## Next safe actions");
  const actionTier = reasoning.tiers.find(t => t.tier === "actions");
  if (actionTier && actionTier.findings.length > 0) {
    for (const finding of actionTier.findings.slice(0, 6)) {
      sections.push(`- ${finding.summary}`);
    }
  } else {
    // Default safe actions
    sections.push("- Review linked records for current status");
    sections.push("- Verify data completeness in source systems");
  }

  return sections.join("\n");
}

/**
 * Legacy: Generate answer using AI Brain reasoning (kept for compatibility)
 */
function generateBrainPoweredAnswer(
  question: string,
  brainResult: {
    context: AIContext;
    factSet: FactSet;
    reasoning: ReasoningOutput;
    confidence: ConfidenceResult;
    contextPrompt: string;
    factsPrompt: string;
    reasoningPrompt: string;
  },
  vectorResults: VectorResult[],
  context: RequestContext
): ComplianceResponse {
  const gaps: string[] = [];
  const bullets: string[] = [];
  const sourceTypesUsed = new Set<string>();
  
  const q = question.toLowerCase();
  const { factSet, reasoning, confidence } = brainResult;

  // Build governance info
  const governance = buildGovernanceInfo(confidence, reasoning.escalation_triggers);

  // Add caution banner if needed
  if (governance.caution_banners.length > 0) {
    bullets.push(...governance.caution_banners.map(b => `**${b}**`));
    bullets.push("");
  }

  // Tenant context
  if (brainResult.context.tenant) {
    const t = brainResult.context.tenant;
    bullets.push(`**Tenant:** ${t.name}`);
    bullets.push(`**Status:** ${t.status}`);
    if (t.rto_id) bullets.push(`**RTO ID:** ${t.rto_id}`);
    if (t.risk_level) bullets.push(`**Risk Level:** ${t.risk_level}`);
    bullets.push("");
  }

  // Include vector results if available
  if (vectorResults.length > 0) {
    bullets.push("**Relevant Context (indexed):**");
    const bySource = new Map<string, VectorResult[]>();
    for (const vr of vectorResults.slice(0, 5)) {
      const existing = bySource.get(vr.source_type) || [];
      existing.push(vr);
      bySource.set(vr.source_type, existing);
      sourceTypesUsed.add(vr.source_type);
    }

    for (const [sourceType, results] of bySource) {
      const sourceLabel = sourceType.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
      bullets.push(`*${sourceLabel}:*`);
      for (const r of results) {
        bullets.push(`- ${citationLabel(r)}: ${r.content.slice(0, 160)}...`);
      }
    }
    bullets.push("");
  }

  // Tier-based responses
  if (q.includes("status") || q.includes("overview") || q.includes("summary")) {
    bullets.push("**Current Status:**");
    const statusTier = reasoning.tiers.find(t => t.tier === "status");
    if (statusTier) {
      for (const finding of statusTier.findings.slice(0, 10)) {
        bullets.push(`- ${finding.summary}`);
      }
    }
    bullets.push("");
  }

  if (q.includes("blocker") || q.includes("block") || q.includes("stuck")) {
    bullets.push("**Blockers:**");
    const blockerTier = reasoning.tiers.find(t => t.tier === "blockers");
    if (blockerTier && blockerTier.findings.length > 0) {
      for (const finding of blockerTier.findings) {
        const icon = finding.severity === "critical" ? "🔴" : "⚠️";
        bullets.push(`${icon} ${finding.summary}`);
        if (finding.details) bullets.push(`  └─ ${finding.details}`);
      }
    } else {
      bullets.push("✅ No active blockers detected");
    }
    bullets.push("");
  }

  if (q.includes("risk") || q.includes("audit") || q.includes("compliance")) {
    bullets.push("**Risk Assessment:**");
    const riskTier = reasoning.tiers.find(t => t.tier === "risk");
    if (riskTier && riskTier.findings.length > 0) {
      for (const finding of riskTier.findings) {
        const icon = finding.severity === "critical" ? "🔴" : "⚠️";
        bullets.push(`${icon} ${finding.summary}`);
      }
    } else {
      bullets.push("✅ No elevated risk indicators");
    }
    bullets.push("");
  }

  if (q.includes("action") || q.includes("next") || q.includes("do")) {
    bullets.push("**Suggested Next Steps:**");
    const actionTier = reasoning.tiers.find(t => t.tier === "actions");
    if (actionTier && actionTier.findings.length > 0) {
      for (const finding of actionTier.findings) {
        bullets.push(`→ ${finding.summary}`);
      }
    } else {
      bullets.push("No immediate actions required");
    }
    bullets.push("");
  }

  // Add escalations if present
  if (reasoning.escalation_triggers.length > 0) {
    bullets.push("**⚠️ Escalation Alerts:**");
    for (const trigger of reasoning.escalation_triggers) {
      const icon = trigger.severity === "critical" ? "🚨" : "⚠️";
      bullets.push(`${icon} ${trigger.message}`);
      bullets.push(`  Action: ${trigger.suggested_action}`);
    }
    bullets.push("");
  }

  // Generic summary if no specific pattern matched
  if (bullets.length <= 6 && vectorResults.length === 0) {
    bullets.push("**Summary:**");
    bullets.push(reasoning.final_summary);
    bullets.push("");
  }

  // Confidence and review reminders
  bullets.push(`*Confidence: ${confidence.level.toUpperCase()}*`);
  if (governance.review_reminders.length > 0) {
    for (const reminder of governance.review_reminders) {
      bullets.push(`📋 ${reminder}`);
    }
  }

  // Gaps
  if (confidence.level !== "high") {
    gaps.push(confidence.explanation);
  }
  if (vectorResults.length === 0) {
    gaps.push("No indexed vector data - using live database only");
  }

  // Build source citations
  const citations = buildSourceCitations(factSet);
  const records: RecordAccessed[] = citations.map(c => ({
    table: c.table,
    id: c.id,
    label: c.label,
  }));

  // Add vector results to records
  for (const vr of vectorResults) {
    records.push({
      table: vr.source_type,
      id: vr.id,
      label: citationLabel(vr),
    });
  }

  return {
    answer_markdown: bullets.join("\n"),
    records_accessed: records,
    confidence: confidence.level,
    gaps,
    chunks_used: vectorResults.length,
    source_types_used: Array.from(sourceTypesUsed),
    reasoning_tiers: reasoning.tiers.map(t => ({
      tier: t.tier,
      finding_count: t.findings.length,
      critical_count: t.findings.filter(f => f.severity === "critical").length,
    })),
    escalation_count: reasoning.escalation_triggers.length,
    governance: {
      read_only: true,
      human_action_required: governance.human_action_required,
      caution_banners: governance.caution_banners,
    },
  };
}

/**
 * V3: Log the interaction to ai_interaction_logs with full audit trail
 */
async function logInteraction(
  supabase: any,
  userId: string,
  tenantId: number,
  profile: UserProfile,
  question: string,
  response: ComplianceResponse,
  context: RequestContext,
  factsResult?: AskVivFactsResult,
  brainResult?: {
    context: AIContext;
    factSet: FactSet;
    reasoning: ReasoningOutput;
    confidence: ConfidenceResult;
  }
): Promise<string | null> {
  try {
    // V3: Build records_accessed from Fact Builder audit data
    const recordsAccessed = factsResult 
      ? factsResult.audit.record_ids_accessed.flatMap(({ table, ids }) => 
          ids.map(id => ({ table, id, label: `${table}:${id}` }))
        )
      : response.records_accessed;

    const { data, error } = await supabase
      .from("ai_interaction_logs")
      .insert({
        user_id: userId,
        tenant_id: tenantId,
        mode: "compliance",
        prompt_text: question,
        response_text: response.answer_markdown,
        records_accessed: recordsAccessed,
        request_context: {
          tenant_id: tenantId,
          client_id: context.client_id || null,
          package_id: context.package_id || null,
          phase_id: context.phase_id || null,
          user_role: profile.unicorn_role,
          confidence: response.confidence,
          gaps_count: response.gaps.length,
          // V3: Fact Builder tracking
          ai_brain_version: "3.0",
          fact_builder_version: "1.0",
          reasoning_tiers: response.reasoning_tiers,
          escalation_count: response.escalation_count,
          fact_count: factsResult?.facts.length || brainResult?.factSet.fact_count || 0,
          categories_analyzed: brainResult?.factSet.categories || [],
          // V3: Audit trail from Fact Builder
          tables_queried: factsResult?.audit.tables_queried || [],
          inference_decisions: factsResult?.audit.inference_decisions || [],
          query_duration_ms: factsResult?.audit.duration_ms || 0,
          gaps: factsResult?.gaps || [],
        },
        chunks_used: response.chunks_used || 0,
        source_types_used: response.source_types_used || [],
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to log interaction:", error);
      return null;
    }
    return (data?.id as string) ?? null;
  } catch (err) {
    console.error("Failed to log interaction:", err);
    // Non-blocking - don't fail the request
    return null;
  }
}
