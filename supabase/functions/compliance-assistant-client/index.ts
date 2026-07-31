/**
 * Compliance Assistant — CLIENT mode
 *
 * Sibling of `compliance-assistant`. Serves Ask Viv to client tenant users
 * (Admin / User). Like V4 of the staff function, the answer is built
 * deterministically from facts. The only external API call is for embedding
 * generation (vector search). NO LLM completion call. NO SRTO retrieval.
 *
 * Hard guardrails:
 *  - Two clients: user-auth `supabase` (RLS-scoped) for reads/RPC; service-role
 *    `serviceClient` only for `ai_client_query_usage` UPSERT and
 *    `ai_interaction_logs` INSERT (Vivacity-only RLS).
 *  - Clients cannot supply scope. tenant_id comes from the access gate.
 *  - Daily cap: 20 queries per UTC day per user.
 *  - Deny-list filter strips internal/staff-only fact sources before formatting.
 *  - Response is exactly 6 fields; no internal metadata leaks.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createServiceClient } from "../_shared/supabase-client.ts";
import { extractToken, verifyAuth, type UserProfile } from "../_shared/auth-helpers.ts";
import { jsonError, jsonRaw } from "../_shared/response-helpers.ts";
import {
  validateClientAskVivAccess,
  askVivAccessDeniedResponse,
  clientAskVivDenialMessage,
  isVivacityInternal,
} from "../_shared/ask-viv-access.ts";
import {
  buildAskVivFacts,
  type AskVivFactsResult,
  type DerivedFact,
} from "../_shared/ask-viv-fact-builder/index.ts";
import {
  processAIBrainInput,
  type ClientData,
  type PackageData,
  type PhaseData,
  type DataForFacts,
} from "../_shared/ai-brain/index.ts";
import { generateEmbedding as generateEmbeddingShared } from "../_shared/openai-embeddings.ts";

// ============= CORS =============
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, " +
    "x-supabase-client-platform, x-supabase-client-platform-version, " +
    "x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ============= Constants =============
const DAILY_QUERY_CAP = 20;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const VIVACITY_TENANT_ID = 6372;

/** Sources whose facts must NEVER be exposed to client-mode users. */
const DENIED_SOURCES = new Set<string>([
  "notes",
  "meeting_transcripts",
  "meeting_transcript",
  "eos_issues",
  "audit_events",
  "ai_interaction_logs",
  "pricing",
  "health_leave",
]);

/** Fact-key fragments that hint at staff PII; if matched, fact is dropped. */
const DENIED_KEY_FRAGMENTS = [
  "owner_email",
  "owner_phone",
  "staff_email",
  "staff_phone",
  "consultant_email",
  "consultant_phone",
];

/** Shared builder for tasks / tasks_tenants facts — extracted so both source_table
 * spellings resolve to the same friendly-label logic. */
function buildTaskLabel(f: DerivedFact): string | null {
  const v = (f.value ?? {}) as Record<string, unknown>;
  const title = (v.title as string | undefined) ?? (v.label as string | undefined);
  if (!title) return null;
  // Owner-substitution: if owner is a Vivacity staff user, swap to "Vivacity".
  const ownerTenantId = (v.owner_tenant_id as number | undefined) ?? null;
  const ownerName = (v.owner_name as string | undefined) ?? null;
  if (ownerTenantId === VIVACITY_TENANT_ID || (ownerName && /vivacity/i.test(ownerName))) {
    return `Task: ${title} (Vivacity)`;
  }
  return `Task: ${title}`;
}

/** Whitelist of source_table → friendly-label builder. Anything not here is suppressed. */
const LABEL_BUILDERS: Record<string, (fact: DerivedFact) => string | null> = {
  client_audits: (f) => {
    const v = (f.value ?? {}) as Record<string, unknown>;
    const auditType = (v.audit_type as string | undefined) ?? "audit";
    const monthYear = (v.month_year as string | undefined) ?? "";
    return `Your ${auditType} audit${monthYear ? ` (${monthYear})` : ""}`;
  },
  package_instances: (f) => {
    const v = (f.value ?? {}) as Record<string, unknown>;
    const name = (v.package_name as string | undefined) ?? (v.name as string | undefined);
    return name ? String(name) : null;
  },
  package_stage_instances: (f) => {
    const v = (f.value ?? {}) as Record<string, unknown>;
    const stageName = (v.stage_name as string | undefined) ?? (v.title as string | undefined);
    return stageName ? `Your ${stageName} stage` : null;
  },
  evidence: (f) => {
    const v = (f.value ?? {}) as Record<string, unknown>;
    const label = (v.filename as string | undefined) ?? (v.label as string | undefined) ?? (v.title as string | undefined);
    return label ? `Evidence: ${label}` : null;
  },
  // "tasks_tenants" is the real per-client task table (Phase 1 fact-source
  // correction); "tasks" is kept as an alias to the same builder in case any
  // other still-live fact producer emits that source_table.
  tasks: (f) => buildTaskLabel(f),
  tasks_tenants: (f) => buildTaskLabel(f),
  eos_rocks: (f) => {
    const v = (f.value ?? {}) as Record<string, unknown>;
    const title = (v.title as string | undefined) ?? (v.label as string | undefined);
    return title ? `Your Rock: ${title}` : null;
  },
  eos_meetings: (f) => {
    const v = (f.value ?? {}) as Record<string, unknown>;
    const date = (v.date as string | undefined) ?? (v.meeting_date as string | undefined);
    return date ? `Meeting on ${date}` : null;
  },
};

// ============= Types =============
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

interface ClientResponse {
  answer_markdown: string;
  records_accessed: { label: string }[];
  confidence: "high" | "medium" | "low";
  gaps: string[];
  freshness: {
    last_activity_at: string | null;
    days_since_activity: number | null;
    status: "fresh" | "aging" | "stale";
    derived_at: string;
  } | null;
  consultant_handoff_suggested: boolean;
}

// ============= Handler =============
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonError(405, "METHOD_NOT_ALLOWED", "Only POST requests are accepted");
  }

  try {
    // 1. Token
    const token = extractToken(req);
    if (!token) {
      return jsonError(401, "UNAUTHORIZED", "No authorization token provided");
    }

    // 2. Build the two clients
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    // deno-lint-ignore no-explicit-any
    const supabase: any = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const serviceClient = createServiceClient();

    // 3. Auth
    const { user, profile, error: authError } = await verifyAuth(supabase, token);
    if (authError || !user || !profile) {
      return jsonError(401, "UNAUTHORIZED", authError || "Authentication failed");
    }

    // 4. Parse body — clients must NOT supply scope.
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonError(400, "BAD_REQUEST", "Invalid JSON body");
    }
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) {
      return jsonError(400, "BAD_REQUEST", "Question is required");
    }
    const previewTenantId =
      typeof body.preview_tenant_id === "number" ? body.preview_tenant_id : undefined;
    const isSuperAdmin = isVivacityInternal(profile);
    for (const forbidden of ["tenant_id", "client_id", "package_id", "phase_id"]) {
      if (forbidden in body) {
        return jsonError(
          400,
          "BAD_REQUEST",
          `Field '${forbidden}' is not allowed; scope is resolved server-side`,
        );
      }
    }
    if (!isSuperAdmin && "preview_tenant_id" in body) {
      return jsonError(400, "BAD_REQUEST", "Field 'preview_tenant_id' is not allowed");
    }

    // 5. Access gate
    const access = await validateClientAskVivAccess(
      supabase,
      user.id,
      profile,
      "compliance-assistant-client",
      previewTenantId,
    );
    if (!access.allowed) {
      return askVivAccessDeniedResponse(clientAskVivDenialMessage(access.reason));
    }
    const gateTenantId = access.tenant_id;

    // 6. Daily cap
    const queryDate = new Date().toISOString().split("T")[0]; // UTC date
    const { data: usageRow } = await supabase
      .from("ai_client_query_usage")
      .select("query_count")
      .eq("user_id", user.id)
      .eq("query_date", queryDate)
      .maybeSingle();
    const priorCount = (usageRow?.query_count as number | undefined) ?? 0;
    if (priorCount >= DAILY_QUERY_CAP) {
      const now = new Date();
      const tomorrow = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0, 0, 0,
      ));
      const retryAfter = Math.max(1, Math.floor((tomorrow.getTime() - now.getTime()) / 1000));
      return new Response(
        JSON.stringify({
          ok: false,
          code: "DAILY_LIMIT_REACHED",
          detail: `You've reached your daily Ask Viv limit (${DAILY_QUERY_CAP} queries). Resets daily.`,
          retry_after_seconds: retryAfter,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": String(retryAfter),
            "Cache-Control": "no-store",
          },
        },
      );
    }

    // 7. Vector search (best-effort) — uses OpenAI direct for embeddings
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    let vectorResults: VectorResult[] = [];
    if (OPENAI_API_KEY) {
      vectorResults = await performVectorSearch(supabase, gateTenantId, question);
    }

    // 8. Fact builder (RLS-scoped via supabase user-auth client)
    let factsResult: AskVivFactsResult;
    try {
      factsResult = await buildAskVivFacts(supabase, {
        user_id: user.id,
        tenant_id: gateTenantId,
        role: isVivacityInternal(profile) ? (profile.unicorn_role ?? "Team Member") : "Team Member",
        scope: { client_id: null, package_id: null, phase_id: null },
        now_iso: new Date().toISOString(),
        timezone: "Australia/Sydney",
        question,
      });
    } catch (err) {
      console.error("Fact Builder error:", err);
      return jsonError(500, "FACT_BUILDER_ERROR", "Failed to build facts for response");
    }

    // 9. Deny-list filter
    const safeFacts = factsResult.facts.filter((f) => {
      if (DENIED_SOURCES.has(f.source_table)) return false;
      const keyLower = f.key.toLowerCase();
      if (DENIED_KEY_FRAGMENTS.some((frag) => keyLower.includes(frag))) return false;
      return true;
    });

    // 10. Brain pipeline (reasoning + confidence)
    const dataForFacts = convertFactsToDataForFacts(safeFacts, gateTenantId);
    const brainResult = processAIBrainInput({
      user: { id: user.id },
      profile,
      tenant: dataForFacts.client
        ? {
            id: gateTenantId,
            name: dataForFacts.client.name,
            status: dataForFacts.client.status,
            rto_id: dataForFacts.client.rto_id,
            risk_level: dataForFacts.client.risk_level,
          }
        : null,
      scope: { client_id: null, package_id: null, phase_id: null },
      data: dataForFacts,
    });

    // 11. Freshness (mirrors compliance-assistant V4)
    const freshness = await deriveFreshness(supabase, gateTenantId);

    // 12. Build response with Gemini
    const friendlyRecords = buildFriendlyRecords(safeFacts);
    const translatedGaps = translateGaps([
      ...factsResult.gaps,
      ...(brainResult.confidence.level !== "high" ? [brainResult.confidence.explanation] : []),
      ...(vectorResults.length === 0 ? ["No vector embeddings"] : []),
    ]);

    const factsContext = buildFactsContext(safeFacts);
    const vivSystemPrompt = `You are Viv, the AI compliance assistant for Unicorn by ComplyHub. You help Australian Registered Training Organisations (RTOs) understand their compliance journey and what to do next.

TENANT ACCOUNT DATA (live data from this tenant's account):
${factsContext}

${vectorResults.length > 0 ? `RELEVANT STANDARDS CONTENT:\n${vectorResults.slice(0, 3).map((v) => `- ${citationLabel(v)}: ${v.content.slice(0, 300)}`).join("\n")}` : ""}

RULES:
- Answer the user's question using only the account facts above and your knowledge of the Standards for RTOs 2025.
- Never say "compliant", "non-compliant", "audit ready", or predict audit outcomes.
- Keep answers concise — 3 to 5 sentences or a short bullet list.
- If you cannot answer from the facts provided, say so clearly and suggest the user contact their Vivacity consultant.
- Use Australian English.
- Do not mention internal system details, table names, or fact keys.`;

    let answerMarkdown: string;
    try {
      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: vivSystemPrompt },
            { role: "user", content: question },
          ],
          max_tokens: 500,
          temperature: 0.3,
        }),
      });
      if (!aiResp.ok) {
        const errText = await aiResp.text();
        console.error("Gemini error:", aiResp.status, errText);
        throw new Error(`Gemini API error: ${aiResp.status}`);
      }
      const aiData = await aiResp.json();
      answerMarkdown =
        aiData.choices?.[0]?.message?.content ??
        "I couldn't generate a response. Please try again.";
    } catch (err) {
      console.error("Gemini call failed:", err);
      answerMarkdown =
        "I'm having trouble connecting right now. Please try again in a moment, or contact your Vivacity consultant directly.";
    }

    const consultantHandoff =
      brainResult.confidence.level === "low" ||
      brainResult.reasoning.escalation_triggers.length > 0;

    // 13. UPSERT usage counter (service-role)
    try {
      await serviceClient
        .from("ai_client_query_usage")
        .upsert(
          {
            user_id: user.id,
            tenant_id: gateTenantId,
            query_date: queryDate,
            query_count: priorCount + 1,
          },
          { onConflict: "user_id,query_date" },
        );
    } catch (err) {
      console.error("ai_client_query_usage upsert failed:", err);
    }

    // 14. INSERT interaction log (service-role; best-effort)
    try {
      const internalRecords = safeFacts.flatMap((f) =>
        f.source_ids.map((id) => ({ table: f.source_table, id, label: f.key })),
      );
      await serviceClient.from("ai_interaction_logs").insert({
        mode: "compliance",
        user_id: user.id,
        tenant_id: gateTenantId,
        prompt_text: question,
        response_text: answerMarkdown,
        records_accessed: internalRecords,
        request_context: {
          surface: "client",
          confidence: brainResult.confidence.level,
          gaps_count: translatedGaps.length,
          tables_queried: factsResult.audit.tables_queried,
        },
        chunks_used: vectorResults.length,
        source_types_used: Array.from(new Set(vectorResults.map((v) => v.source_type))),
      });
    } catch (err) {
      console.error("ai_interaction_logs insert failed (non-blocking):", err);
    }

    // 15. Return strict 6-field shape
    const response: ClientResponse = {
      answer_markdown: answerMarkdown,
      records_accessed: friendlyRecords,
      confidence: brainResult.confidence.level,
      gaps: translatedGaps,
      freshness,
      consultant_handoff_suggested: consultantHandoff,
    };
    return jsonRaw(response);
  } catch (err) {
    console.error("compliance-assistant-client error:", err);
    return jsonError(500, "INTERNAL_ERROR", "An unexpected error occurred");
  }
});

// ============= Helpers =============

/**
 * Vector search — uses the user-auth supabase client so RLS scopes results.
 * Mirrors the compliance-assistant helper exactly, including model name.
 */
async function performVectorSearch(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  tenantId: number,
  query: string,
): Promise<VectorResult[]> {
  try {
    let embedding: number[];
    try {
      embedding = await generateEmbeddingShared(query);
    } catch (err) {
      console.error("Embedding generation failed:", err);
      return [];
    }
    // Search the SRTO corpus (global reference content; not tenant-scoped).
    // tenantId is unused for srto_corpus but kept on the helper signature for caller stability.
    void tenantId;
    const { data, error } = await supabase.rpc("match_srto_chunks", {
      query_embedding: embedding,
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
    // deno-lint-ignore no-explicit-any
    return ((data || []) as any[]).map((r) => ({
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

/** Convert filtered facts into the AI-Brain DataForFacts shape. */
function convertFactsToDataForFacts(facts: DerivedFact[], tenantId: number): DataForFacts {
  const tenantNameFact = facts.find((f) => f.key === "tenant_name");
  const tenantStatusFact = facts.find((f) => f.key === "tenant_status");
  const rtoIdFact = facts.find((f) => f.key === "tenant_rto_id");
  const riskLevelFact = facts.find((f) => f.key === "tenant_risk_level");

  const client: ClientData | undefined = tenantNameFact
    ? {
        id: tenantId,
        name: String(tenantNameFact.value),
        status: String(tenantStatusFact?.value || "unknown"),
        rto_id: rtoIdFact ? String(rtoIdFact.value) : null,
        risk_level: riskLevelFact ? String(riskLevelFact.value) : null,
      }
    : undefined;

  const packages: PackageData[] = facts
    .filter((f) => f.key === "package_status")
    .map((f) => {
      const v = f.value as { id: number; name: string; status: string; type?: string };
      return { id: v.id, name: v.name, status: v.status, package_type: v.type };
    });

  const phases: PhaseData[] = facts
    .filter((f) => f.key === "phase_status")
    .map((f) => {
      const v = f.value as { id: number; title: string; status: string; stage_type?: string };
      return { id: v.id, title: v.title, status: v.status, stage_type: v.stage_type };
    });

  return { client, packages, phases, tasks: [], evidence: [], risks: [] };
}

/** Build {label}[] for records_accessed from filtered facts. Suppress non-whitelisted. */
function buildFriendlyRecords(facts: DerivedFact[]): { label: string }[] {
  const seen = new Set<string>();
  const out: { label: string }[] = [];
  for (const fact of facts) {
    const builder = LABEL_BUILDERS[fact.source_table];
    if (!builder) continue;
    const label = builder(fact);
    if (!label) continue;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ label });
  }
  return out.slice(0, 12);
}

/** Translate raw gap strings into client-friendly language. Dedupe. */
function translateGaps(rawGaps: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of rawGaps) {
    const r = (raw || "").toLowerCase();
    let translated: string;
    if (r.includes("no relevant facts")) {
      translated = "No relevant information found in your account";
    } else if (r.includes("no vector embeddings")) {
      translated = "We don't have indexed content for this question yet";
    } else if (r.includes("low confidence") || r.includes("conflict") || r.includes("ambigu")) {
      translated = "We're not fully confident in this answer";
    } else if (r.includes("tables_queried did not contain")) {
      translated = "We couldn't find this type of information";
    } else {
      translated = "No relevant information found in your account";
    }
    if (!seen.has(translated)) {
      seen.add(translated);
      out.push(translated);
    }
  }
  return out;
}

/** Derive freshness using the same rules as compliance-assistant V4. */
async function deriveFreshness(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  tenantId: number,
): Promise<ClientResponse["freshness"]> {
  try {
    let lastActivityAt: string | null = null;
    const { data: auditRow } = await supabase
      .from("audit_events")
      .select("created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    lastActivityAt = (auditRow?.created_at as string | undefined) ?? null;




    const days = lastActivityAt
      ? Math.floor((Date.now() - new Date(lastActivityAt).getTime()) / 86_400_000)
      : null;
    const status: "fresh" | "aging" | "stale" =
      days === null ? "stale" : days <= 14 ? "fresh" : days <= 30 ? "aging" : "stale";

    return {
      last_activity_at: lastActivityAt,
      days_since_activity: days,
      status,
      derived_at: new Date().toISOString(),
    };
  } catch (err) {
    console.warn("freshness derivation failed:", err);
    return null;
  }
}

/** Summarise safe facts into plain text for the Gemini system prompt. */
function buildFactsContext(facts: DerivedFact[]): string {
  const lines: string[] = [];

  const tenantName = facts.find((f) => f.key === "tenant_name")?.value;
  const tenantStatus = facts.find((f) => f.key === "tenant_status")?.value;
  if (tenantName) {
    lines.push(`Organisation: ${tenantName}${tenantStatus ? ` (${tenantStatus})` : ""}`);
  }

  const pkgCount = facts.find((f) => f.key === "package_count")?.value as
    | { total: number; active: number }
    | undefined;
  if (pkgCount) {
    lines.push(`Packages: ${pkgCount.total} total, ${pkgCount.active} currently active`);
  }

  const activePackages = facts
    .filter((f) => f.key === "package_status")
    .map((f) => {
      const v = f.value as { name: string; status: string };
      return `${v.name} (${v.status})`;
    });
  if (activePackages.length > 0) {
    lines.push(`Active packages: ${activePackages.join(", ")}`);
  }

  const incomplete = facts.find((f) => f.key === "tasks_incomplete_count")?.value;
  const overdue = facts.find((f) => f.key === "tasks_overdue_count")?.value;
  if (incomplete !== undefined) lines.push(`Incomplete tasks: ${incomplete}`);
  if (overdue !== undefined && (overdue as number) > 0) lines.push(`Overdue tasks: ${overdue}`);

  const nextTask = facts.find((f) => f.key === "next_due_task")?.value as
    | { label: string; due_date: string }
    | undefined;
  if (nextTask) lines.push(`Next task due: "${nextTask.label}" on ${nextTask.due_date}`);

  const phases = facts
    .filter((f) => f.key === "phase_status")
    .map((f) => {
      const v = f.value as { title: string; status: string };
      return `${v.title} (${v.status})`;
    });
  if (phases.length > 0) lines.push(`Phases/stages: ${phases.join(", ")}`);

  const consult = facts.find((f) => f.key === "consult_hours_recent")?.value as
    | { hours: number; period_days: number }
    | undefined;
  if (consult) lines.push(`Consulting hours (last ${consult.period_days} days): ${consult.hours}`);

  return lines.length > 0 ? lines.join("\n") : "No account data available.";
}

