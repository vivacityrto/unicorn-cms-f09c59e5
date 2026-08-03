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
  buildGovernanceInfo,
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
import { buildPortfolioFacts } from "../_shared/ask-viv-fact-builder/portfolio-facts.ts";
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

// Phase 3: intent classification, real LLM generation, and the safety pipeline
import {
  classifyAskVivIntent,
  isBlockedIntent,
  getBlockedResponse,
  buildIntentAuditEntry,
  DECISION_REQUEST_REFRAME_INSTRUCTION,
  runAskVivSafetyPipeline,
  buildSafetyAuditEntry,
  type IntentResult,
  type IntentAuditEntry,
  type SafetyMeta,
} from "../_shared/ask-viv-prompts/index.ts";

// Phase 6: portfolio-wide scope
import { PORTFOLIO_SCOPE_INSTRUCTION } from "../_shared/ask-viv-prompts/index.ts";

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

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
  conversation_id?: string | null;
  // Phase 6: "portfolio" requests skip the tenant_id requirement entirely —
  // context is ignored in that case. Defaults to "tenant" for callers that
  // don't send this field (backward compatible).
  scope_kind?: "tenant" | "portfolio";
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

/**
 * Phase 3: whether this user gets real LLM generation, or the deterministic
 * template path. Master kill switch first (instant off with no deploy),
 * then rollout rings: Super Admin always once the master flag is on, named
 * beta users next, then everyone once ask_viv_llm_generation_all_staff flips.
 */
async function isLlmGenerationEnabledForUser(
  supabase: any,
  userId: string,
  profile: UserProfile
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("ask_viv_llm_generation_enabled, ask_viv_llm_generation_beta_user_ids, ask_viv_llm_generation_all_staff")
      .limit(1)
      .maybeSingle();

    if (!data?.ask_viv_llm_generation_enabled) return false;
    if (data.ask_viv_llm_generation_all_staff) return true;
    if (checkSuperAdmin(profile)) return true;
    const betaUserIds: string[] = data.ask_viv_llm_generation_beta_user_ids || [];
    return betaUserIds.includes(userId);
  } catch (err) {
    console.error("Failed to check LLM generation flag, defaulting to deterministic path:", err);
    return false;
  }
}

/**
 * Call the Lovable AI Gateway (house standard for LLM calls — used by 18
 * other edge functions in this codebase, including compliance-assistant's
 * client-facing sibling). Direct OpenAI stays embeddings-only; the gateway
 * doesn't support them.
 */
async function callLovableGateway(systemPrompt: string, userMessage: string): Promise<string> {
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY not configured");
  }

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: 1200,
      temperature: 0.2,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Lovable Gateway error: ${resp.status} ${errText}`);
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Lovable Gateway returned no content");
  }
  return content as string;
}

/** Extract the LLM's own stated confidence from its "## Confidence" section. */
function extractConfidenceFromMarkdown(markdown: string): "high" | "medium" | "low" | null {
  const match = markdown.match(/##\s*Confidence\s*\n\s*\*\*(High|Medium|Low)\*\*/i);
  return match ? (match[1].toLowerCase() as "high" | "medium" | "low") : null;
}

/**
 * Confidence stays authoritative from the deterministic ai-brain scorer — if
 * the LLM's stated confidence disagrees, take the lower one. Never let the
 * model talk itself up on a regulatory surface.
 */
function pickLowerConfidence(
  a: "high" | "medium" | "low",
  b: "high" | "medium" | "low"
): "high" | "medium" | "low" {
  const rank = { low: 0, medium: 1, high: 2 } as const;
  return rank[a] <= rank[b] ? a : b;
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

    // Phase 6: portfolio-wide scope skips the tenant_id requirement entirely —
    // every internal staff role can see the whole active client base by
    // design (see portfolio-facts.ts header comment).
    const scopeKind: "tenant" | "portfolio" = payload.scope_kind === "portfolio" ? "portfolio" : "tenant";
    if (scopeKind === "portfolio") {
      return await handlePortfolioRequest(supabase, user, profile, question, payload.conversation_id ?? null);
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

    // Phase 5: resolve or create the conversation this turn belongs to. A
    // conversation is a lightweight, user-deletable container distinct from
    // the permanent ai_interaction_logs audit trail — creating/touching it
    // doesn't read any tenant data, so this can happen ahead of intent
    // classification and the audit pre-flight insert.
    const conversationId = await resolveOrCreateConversation(
      supabase,
      user.id,
      tenantId,
      payload.conversation_id,
      question
    );
    await logTurn(supabase, conversationId, "user", question);

    // Phase 3: classify intent before touching any tenant data. Only
    // out_of_scope (genuine boundary violations — prompt injection, policy
    // bypass, unrelated small talk) hard-blocks; decision_request ("does
    // this meet the standard") is reframed later, not blocked, since it's
    // the single most valuable question a CSC asks.
    const intentResult = classifyAskVivIntent(question);

    // Two-write audit model: a pre-flight insert BEFORE any tenant data is
    // queried. Fail closed — if this fails, no fact-builder/vector-search
    // queries run at all, and the request is rejected outright, since by the
    // time a second write could fail the data would already have been read
    // with no audit record of it.
    const { data: preflightAudit, error: preflightAuditError } = await supabase
      .from("ai_interaction_logs")
      .insert({
        user_id: user.id,
        tenant_id: tenantId,
        mode: "compliance",
        prompt_text: question,
        response_text: "(pending)",
        records_accessed: [],
        conversation_id: conversationId,
        request_context: {
          status: "pending",
          tenant_id: tenantId,
          client_id: context.client_id || null,
          package_id: context.package_id || null,
          phase_id: context.phase_id || null,
          user_role: profile.unicorn_role,
          ...buildIntentAuditEntry(intentResult),
        },
      })
      .select("id")
      .single();

    if (preflightAuditError || !preflightAudit) {
      console.error("Pre-flight audit insert failed, aborting request:", preflightAuditError);
      return jsonError(503, "AUDIT_UNAVAILABLE", "Unable to establish an audit record for this request. Please try again.");
    }
    const auditLogId: string = preflightAudit.id;

    if (isBlockedIntent(intentResult.intent)) {
      const blockedMarkdown = getBlockedResponse(intentResult.intent, "compliance");
      const blockedResponse: ComplianceResponse = {
        answer_markdown: blockedMarkdown,
        records_accessed: [],
        confidence: "low",
        gaps: ["Request blocked by intent classifier before any tenant data was queried."],
        chunks_used: 0,
        source_types_used: [],
        governance: { read_only: true, human_action_required: false, caution_banners: [] },
        validation: { valid: true, warnings: 0, sanitized: false },
      };
      const auditLogged = await updateAuditLog(supabase, auditLogId, blockedResponse, {
        blocked: true,
        intent: buildIntentAuditEntry(intentResult),
        profile,
        context,
      });
      await logTurn(supabase, conversationId, "assistant", blockedMarkdown);
      return jsonRaw({
        ...blockedResponse,
        scope_lock: null,
        freshness: null,
        explain: null,
        ai_interaction_log_id: auditLogId,
        audit_logged: auditLogged,
        conversation_id: conversationId,
      });
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

    // Phase 3: generate the answer via a real LLM call when this user is in
    // the rollout, falling back to the deterministic template path on any
    // failure (flag off, gateway error, safety pipeline exhausted) so a
    // broken rollout never takes down the feature for anyone.
    const llmEnabled = await isLlmGenerationEnabledForUser(supabase, user.id, profile);
    let response: ComplianceResponse;
    if (llmEnabled) {
      try {
        response = await generateLlmAnswer(question, factsResult, brainResult, vectorResults, intentResult, user.id);
      } catch (llmErr) {
        console.error("LLM generation failed, falling back to deterministic template:", llmErr);
        response = generateFactBasedAnswer(question, factsResult, brainResult, vectorResults, context);
        response.gaps.push("Real-time generation was unavailable — showing the deterministic summary instead.");
      }
    } else {
      response = generateFactBasedAnswer(question, factsResult, brainResult, vectorResults, context);
    }

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

    // Two-write audit model, second write: update the pre-flight row with
    // the real outcome. Best-effort — if this fails, the response still
    // returns (the request itself succeeded), but audit_logged: false tells
    // the UI to show a real "not logged" state instead of a false-positive
    // "Audit logged" badge.
    const auditLogged = await updateAuditLog(supabase, auditLogId, response, {
      blocked: false,
      profile,
      context,
      factsResult,
      brainResult,
    });
    await logTurn(supabase, conversationId, "assistant", response.answer_markdown);

    // Strip internal safety_meta before returning to client
    const { safety_meta: _safetyMeta, ...responseClean } = response as typeof response & { safety_meta?: unknown };
    return jsonRaw({
      ...responseClean,
      scope_lock,
      freshness,
      explain,
      ai_interaction_log_id: auditLogId,
      audit_logged: auditLogged,
      conversation_id: conversationId,
    });

  } catch (err) {
    console.error("Compliance assistant error:", err);
    return jsonError(500, "INTERNAL_ERROR", "An unexpected error occurred");
  }
});

/**
 * Phase 5: resolve an existing conversation (if the caller passed one they
 * actually own) or create a new one. Conversation history is a convenience
 * layer, not the audit trail — a failure to create/verify one never fails
 * the request; it falls back to a fresh in-memory id so turn logging still
 * has somewhere consistent to point, even if no row ends up persisted.
 */
async function resolveOrCreateConversation(
  supabase: any,
  userId: string,
  tenantId: number | null,
  requestedConversationId: string | null | undefined,
  question: string
): Promise<string> {
  if (requestedConversationId) {
    const { data } = await supabase
      .from("ask_viv_conversations")
      .select("id")
      .eq("id", requestedConversationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (data) {
      await supabase
        .from("ask_viv_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", requestedConversationId);
      return requestedConversationId;
    }
    // Requested id doesn't exist or isn't owned by this user — fall through
    // and start a fresh conversation rather than failing the request.
  }

  const title = question.length > 80 ? `${question.slice(0, 77)}...` : question;
  const { data: created, error } = await supabase
    .from("ask_viv_conversations")
    .insert({ user_id: userId, tenant_id: tenantId, title })
    .select("id")
    .single();

  if (error || !created) {
    console.error("Failed to create ask_viv_conversations row:", error);
    return crypto.randomUUID();
  }
  return created.id;
}

/** Best-effort turn log. Never fails the request — conversation history is a convenience layer, not the audit trail. */
async function logTurn(
  supabase: any,
  conversationId: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from("ask_viv_turns")
      .insert({ conversation_id: conversationId, role, content, mode: "compliance" });
    if (error) {
      console.error(`Failed to log ${role} turn:`, error);
    }
  } catch (err) {
    console.error(`Failed to log ${role} turn:`, err);
  }
}

/**
 * Phase 6: handle a portfolio-wide scope request. Kept as a self-contained
 * path rather than threading a scope_kind branch through the entire
 * tenant-scoped handler above — the response shape (no scope_lock/freshness/
 * explain, no per-tenant record links) and fact source are different enough
 * that a shared code path would need as much branching as this does anyway,
 * for less clarity. Reuses conversation resolution, turn logging, intent
 * classification, and the two-write audit model unchanged.
 */
async function handlePortfolioRequest(
  supabase: any,
  user: { id: string; email?: string },
  profile: UserProfile,
  question: string,
  requestedConversationId: string | null
): Promise<Response> {
  const conversationId = await resolveOrCreateConversation(supabase, user.id, null, requestedConversationId, question);
  await logTurn(supabase, conversationId, "user", question);

  const intentResult = classifyAskVivIntent(question);

  const { data: preflightAudit, error: preflightAuditError } = await supabase
    .from("ai_interaction_logs")
    .insert({
      user_id: user.id,
      tenant_id: null,
      mode: "compliance",
      prompt_text: question,
      response_text: "(pending)",
      records_accessed: [],
      conversation_id: conversationId,
      request_context: {
        status: "pending",
        scope_kind: "portfolio",
        user_role: profile.unicorn_role,
        ...buildIntentAuditEntry(intentResult),
      },
    })
    .select("id")
    .single();

  if (preflightAuditError || !preflightAudit) {
    console.error("Portfolio pre-flight audit insert failed, aborting request:", preflightAuditError);
    return jsonError(503, "AUDIT_UNAVAILABLE", "Unable to establish an audit record for this request. Please try again.");
  }
  const auditLogId: string = preflightAudit.id;

  if (isBlockedIntent(intentResult.intent)) {
    const blockedMarkdown = getBlockedResponse(intentResult.intent, "compliance");
    await updateAuditLog(supabase, auditLogId, {
      answer_markdown: blockedMarkdown,
      records_accessed: [],
      confidence: "low",
      gaps: ["Request blocked by intent classifier before portfolio data was queried."],
    } as ComplianceResponse, { blocked: true, intent: buildIntentAuditEntry(intentResult), profile, context: { tenant_id: null } });
    await logTurn(supabase, conversationId, "assistant", blockedMarkdown);
    return jsonRaw({
      answer_markdown: blockedMarkdown,
      records_accessed: [],
      confidence: "low",
      gaps: ["Request blocked by intent classifier before portfolio data was queried."],
      scope_kind: "portfolio",
      ai_interaction_log_id: auditLogId,
      audit_logged: true,
      conversation_id: conversationId,
    });
  }

  const portfolioFacts = await buildPortfolioFacts(supabase, user.id);
  const llmEnabled = await isLlmGenerationEnabledForUser(supabase, user.id, profile);

  let answerMarkdown: string;
  let confidence: "high" | "medium" | "low";
  const gaps = [...portfolioFacts.gaps];
  let generationMode: "llm" | "unavailable" = "unavailable";

  if (llmEnabled && portfolioFacts.facts.length > 0) {
    try {
      const systemPrompt = buildFullPrompt("compliance", {
        facts: portfolioFacts.facts,
        record_links: [],
        gaps: portfolioFacts.gaps,
        question,
        extra_instructions: PORTFOLIO_SCOPE_INSTRUCTION,
      });
      const rawText = await callLovableGateway(systemPrompt, question);

      const safetyMeta: SafetyMeta = {
        mode: "compliance",
        gaps_in: gaps,
        records_accessed_in: [],
        request_id: crypto.randomUUID(),
        user_id: user.id,
        tenant_id: null,
      };
      const pipelineResult = await runAskVivSafetyPipeline({
        mode: "compliance",
        raw_text: rawText,
        meta: safetyMeta,
        repairOnce: (repairPrompt: string) => callLovableGateway(systemPrompt, repairPrompt),
      });

      const { sanitized } = sanitizeResponse(pipelineResult.final_text);
      answerMarkdown = sanitized;
      // No deterministic per-tenant confidence scorer applies across an
      // entire portfolio — a simple heuristic (gaps present -> medium, none
      // -> high) stands in for it, reconciled against the LLM's own stated
      // confidence the same way tenant-scoped requests are.
      const heuristicConfidence: "high" | "medium" | "low" = gaps.length === 0 ? "high" : "medium";
      const llmConfidence = extractConfidenceFromMarkdown(pipelineResult.final_text);
      confidence = llmConfidence ? pickLowerConfidence(llmConfidence, heuristicConfidence) : heuristicConfidence;
      generationMode = "llm";
    } catch (err) {
      console.error("Portfolio LLM generation failed:", err);
      answerMarkdown = buildPortfolioFallbackMarkdown(portfolioFacts);
      confidence = "low";
      gaps.push("Real-time portfolio narration was unavailable — showing a minimal summary instead.");
    }
  } else {
    answerMarkdown = buildPortfolioFallbackMarkdown(portfolioFacts);
    confidence = "low";
    if (!llmEnabled) {
      gaps.push("Portfolio narration requires real-time generation, which is not yet enabled for this account.");
    }
  }

  const recordsAccessed: RecordAccessed[] = portfolioFacts.tenant_ids_touched.map(id => ({
    table: "v_dashboard_attention_ranked",
    id,
    label: `tenant:${id}`,
  }));

  const response: ComplianceResponse = {
    answer_markdown: answerMarkdown,
    records_accessed: recordsAccessed,
    confidence,
    gaps,
    chunks_used: 0,
    source_types_used: [],
    governance: { read_only: true, human_action_required: false, caution_banners: [] },
    validation: { valid: true, warnings: 0, sanitized: false },
  };

  const auditLogged = await updateAuditLog(supabase, auditLogId, response, {
    blocked: false,
    profile,
    context: { tenant_id: null },
  });
  await updateAuditLogPortfolioExtras(supabase, auditLogId, portfolioFacts.tenant_ids_touched, generationMode, portfolioFacts.tables_queried);
  await logTurn(supabase, conversationId, "assistant", answerMarkdown);

  return jsonRaw({
    ...response,
    scope_kind: "portfolio",
    scope_lock: null,
    freshness: null,
    explain: null,
    ai_interaction_log_id: auditLogId,
    audit_logged: auditLogged,
    conversation_id: conversationId,
  });
}

/** Minimal, honest fallback when portfolio LLM narration isn't available — just the raw summary counts, no fabricated narrative. */
function buildPortfolioFallbackMarkdown(portfolioFacts: { facts: DerivedFact[] }): string {
  const summary = portfolioFacts.facts.find(f => f.key === "portfolio_summary")?.value as
    | { total_active_clients: number; my_clients_count: number; total_overdue_tasks: number }
    | undefined;
  const lines = ["## Answer"];
  if (summary) {
    lines.push(`- ${summary.total_active_clients} active clients across the portfolio`);
    lines.push(`- ${summary.my_clients_count} clients assigned to you`);
    lines.push(`- ${summary.total_overdue_tasks} overdue tasks portfolio-wide`);
  } else {
    lines.push("- Portfolio data is not available right now.");
  }
  lines.push("", "## Key records used", "- None", "", "## Confidence", "**Low**", "", "## Gaps",
    "- Real-time portfolio narration is not available for this account.", "",
    "## Next safe actions", "- Review the attention/dashboard views directly for full detail.");
  return lines.join("\n");
}

/** Records portfolio-specific audit context that doesn't fit the tenant-scoped updateAuditLog's shape. */
async function updateAuditLogPortfolioExtras(
  supabase: any,
  auditLogId: string,
  tenantIdsTouched: number[],
  generationMode: string,
  tablesQueried: string[]
): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from("ai_interaction_logs")
      .select("request_context")
      .eq("id", auditLogId)
      .single();
    await supabase
      .from("ai_interaction_logs")
      .update({
        request_context: {
          ...(existing?.request_context ?? {}),
          tenant_ids_touched: tenantIdsTouched,
          generation_mode: generationMode,
          tables_queried: tablesQueried,
        },
      })
      .eq("id", auditLogId);
  } catch (err) {
    console.error("Failed to record portfolio audit extras:", err);
  }
}

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
      generation_mode: "deterministic" as const,
    },
  };
}

/**
 * Phase 3: Generate answer via a real LLM call (Lovable Gateway), wired
 * through the safety pipeline (phrase filter → response validator → one
 * repair pass), with the deterministic confidence scorer kept authoritative.
 * Only called when isLlmGenerationEnabledForUser() is true; any failure here
 * is caught by the caller and falls back to generateFactBasedAnswer.
 */
async function generateLlmAnswer(
  question: string,
  factsResult: AskVivFactsResult,
  brainResult: {
    context: AIContext;
    factSet: FactSet;
    reasoning: ReasoningOutput;
    confidence: ConfidenceResult;
  },
  vectorResults: VectorResult[],
  intentResult: IntentResult,
  userId: string
): Promise<ComplianceResponse> {
  const gaps: string[] = [...factsResult.gaps];
  const sourceTypesUsed = new Set<string>();
  for (const vr of vectorResults) sourceTypesUsed.add(vr.source_type);
  if (vectorResults.length === 0) {
    gaps.push("No indexed vector data - using live database only");
  }

  const records: RecordAccessed[] = factsToRecordsAccessed(factsResult.facts);
  for (const vr of vectorResults) {
    records.push({ table: vr.source_type, id: vr.id, label: citationLabel(vr) });
  }

  const extraInstructions =
    intentResult.intent === "decision_request" ? DECISION_REQUEST_REFRAME_INSTRUCTION : undefined;

  const systemPrompt = buildFullPrompt("compliance", {
    facts: factsResult.facts,
    record_links: factsResult.record_links,
    gaps: factsResult.gaps,
    vector_results: vectorResults.map(vr => ({
      source_document: vr.source_document,
      framework: vr.framework,
      clause: vr.clause,
      chunk_index: vr.chunk_index,
      content: vr.content,
    })),
    question,
    extra_instructions: extraInstructions,
  });

  const rawText = await callLovableGateway(systemPrompt, question);

  const safetyMeta: SafetyMeta = {
    mode: "compliance",
    gaps_in: gaps,
    records_accessed_in: records.map(r => ({ table: r.table, id: String(r.id), label: r.label })),
    request_id: crypto.randomUUID(),
    user_id: userId,
    tenant_id: String(factsResult.context.tenant_id),
  };

  const pipelineResult = await runAskVivSafetyPipeline({
    mode: "compliance",
    raw_text: rawText,
    meta: safetyMeta,
    repairOnce: (repairPrompt: string) => callLovableGateway(systemPrompt, repairPrompt),
  });

  const llmConfidence = extractConfidenceFromMarkdown(pipelineResult.final_text);
  const deterministicConfidence = brainResult.confidence.level;
  let finalConfidence = deterministicConfidence;
  if (llmConfidence && llmConfidence !== deterministicConfidence) {
    finalConfidence = pickLowerConfidence(llmConfidence, deterministicConfidence);
    gaps.push(
      `Confidence discrepancy: model stated ${llmConfidence}, computed ${deterministicConfidence} from facts — using the lower value.`
    );
  }

  const governance = buildGovernanceInfo(brainResult.confidence, brainResult.reasoning.escalation_triggers);
  if (pipelineResult.blocked) {
    governance.caution_banners.push("⚠️ Response required a safety correction before display");
  }

  const { sanitized, modifications } = sanitizeResponse(pipelineResult.final_text);

  return {
    answer_markdown: sanitized,
    records_accessed: records,
    confidence: finalConfidence,
    gaps,
    chunks_used: vectorResults.length,
    source_types_used: Array.from(sourceTypesUsed),
    reasoning_tiers: brainResult.reasoning.tiers.map(t => ({
      tier: t.tier,
      finding_count: t.findings.length,
      critical_count: t.findings.filter(f => f.severity === "critical").length,
    })),
    escalation_count: brainResult.reasoning.escalation_triggers.length,
    governance: {
      read_only: true,
      human_action_required: governance.human_action_required,
      caution_banners: governance.caution_banners,
    },
    validation: {
      valid: pipelineResult.validator.ok,
      warnings: pipelineResult.validator.errors.length,
      sanitized: modifications.length > 0 || pipelineResult.repaired,
    },
    // Internal-only: stripped before returning to client; used to build explain payload + audit trail
    safety_meta: {
      validation: {
        valid: pipelineResult.validator.ok,
        errors: pipelineResult.validator.errors,
        warnings: [] as { code: string; message: string }[],
      },
      modifications,
      generation_mode: "llm" as const,
      intent: buildIntentAuditEntry(intentResult),
      safety_audit: buildSafetyAuditEntry(pipelineResult),
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

interface AuditUpdateExtra {
  blocked: boolean;
  intent?: IntentAuditEntry;
  profile?: UserProfile;
  context?: RequestContext;
  factsResult?: AskVivFactsResult;
  brainResult?: {
    context: AIContext;
    factSet: FactSet;
    reasoning: ReasoningOutput;
    confidence: ConfidenceResult;
  };
}

/**
 * Two-write audit model, second write: UPDATE the pre-flight row created
 * before any tenant data was queried. Best-effort — a failure here doesn't
 * fail the request (the answer was already generated), but the caller
 * reports it as audit_logged: false so the UI never shows a false-positive
 * "Audit logged" badge.
 */
async function updateAuditLog(
  supabase: any,
  auditLogId: string,
  response: ComplianceResponse,
  extra: AuditUpdateExtra
): Promise<boolean> {
  try {
    const recordsAccessed = extra.factsResult
      ? extra.factsResult.audit.record_ids_accessed.flatMap(({ table, ids }) =>
          ids.map(id => ({ table, id, label: `${table}:${id}` }))
        )
      : response.records_accessed;

    const safetyMeta = (response as { safety_meta?: { generation_mode?: string } }).safety_meta;

    const { error } = await supabase
      .from("ai_interaction_logs")
      .update({
        response_text: response.answer_markdown,
        records_accessed: recordsAccessed,
        request_context: {
          status: extra.blocked ? "blocked" : "completed",
          client_id: extra.context?.client_id ?? null,
          package_id: extra.context?.package_id ?? null,
          phase_id: extra.context?.phase_id ?? null,
          user_role: extra.profile?.unicorn_role,
          confidence: response.confidence,
          gaps_count: response.gaps.length,
          ai_brain_version: "3.0",
          fact_builder_version: "1.0",
          generation_mode: safetyMeta?.generation_mode ?? "deterministic",
          reasoning_tiers: response.reasoning_tiers,
          escalation_count: response.escalation_count,
          fact_count: extra.factsResult?.facts.length || extra.brainResult?.factSet.fact_count || 0,
          categories_analyzed: extra.brainResult?.factSet.categories || [],
          tables_queried: extra.factsResult?.audit.tables_queried || [],
          inference_decisions: extra.factsResult?.audit.inference_decisions || [],
          query_duration_ms: extra.factsResult?.audit.duration_ms || 0,
          gaps: extra.factsResult?.gaps || [],
          ...(extra.intent ?? {}),
        },
        chunks_used: response.chunks_used || 0,
        source_types_used: response.source_types_used || [],
      })
      .eq("id", auditLogId);

    if (error) {
      console.error("Failed to update audit log:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Failed to update audit log:", err);
    return false;
  }
}
