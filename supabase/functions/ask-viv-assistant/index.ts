/**
 * Ask Viv Assistant Edge Function
 *
 * A new, separate conversational assistant from the existing compliance-assistant
 * — genuinely conversational (no forced Answer/Confidence/Gaps template), backed
 * by Claude Sonnet via a direct Anthropic integration (the Lovable AI Gateway does
 * not support Anthropic models at all — confirmed against Lovable's own docs), and
 * using real tool-use (agentic) retrieval instead of a pre-fetch-then-generate
 * model: Claude decides for itself when to look up a client, pull facts, or search
 * notes/documents, rather than requiring an upfront scope selection.
 *
 * "Lighter guardrails" by design: no intent classifier, no phrase filter, no
 * two-write fail-closed audit model — this assistant doesn't carry the same
 * regulatory-determination risk the existing Compliance mode was built to guard
 * against. Still read-only, still cites sources, still never fabricates beyond
 * what a tool actually returned.
 *
 * Phase D: all originally-planned tools exist — search_clients,
 * get_client_context, search_notes_and_emails, search_eos, and
 * search_documents (RAG over real generated-document content, populated by
 * embed-ask-viv-documents).
 *
 * Phase F (added after the original plan): search_standards, reusing the
 * existing match_srto_chunks RPC / srto_corpus — the same regulatory corpus
 * the existing Compliance mode panel already searches — so this assistant
 * can also answer standards/clause questions, not just client-specific ones.
 *
 * Phase H (added after live user testing surfaced a real gap): staff-to-
 * client lookups. Prior to this, asking "which clients does X manage" got
 * an honest "I don't have a tool for that" — every existing tool resolves
 * FROM a client, none resolve FROM a staff member. list_clients_for_staff
 * uses tenant_csc_assignments (the authoritative CSC-assignment table) to
 * close that gap.
 */

import { createServiceClient } from "../_shared/supabase-client.ts";
import { extractToken, verifyAuth, checkSuperAdmin, UserProfile } from "../_shared/auth-helpers.ts";
import { jsonError, jsonRaw } from "../_shared/response-helpers.ts";
import { validateAskVivAccess, askVivAccessDeniedResponse } from "../_shared/ask-viv-access.ts";
import { resolveOrCreateConversation, logTurn, loadConversationContext } from "../_shared/ask-viv-conversations.ts";
import {
  buildAskVivFacts,
  formatFactsForLLM,
  type AskVivFactBuilderInput,
} from "../_shared/ask-viv-fact-builder/index.ts";
import { generateEmbedding } from "../_shared/openai-embeddings.ts";
import {
  callAnthropic,
  callAnthropicHaiku,
  extractText,
  extractToolUses,
  sumUsage,
  CLAUDE_SONNET_MODEL,
  type AnthropicMessage,
  type AnthropicToolDefinition,
  type AnthropicResponse,
} from "../_shared/anthropic-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, " +
    "x-supabase-client-platform, x-supabase-client-platform-version, " +
    "x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Hard cap on tool-call round trips per user message — a reliability guardrail
// as much as a cost one, since an unbounded agentic loop could otherwise spin
// forever on an ambiguous request.
const MAX_TOOL_ITERATIONS = 6;

// Conversation summarization thresholds.
const SUMMARIZE_TRIGGER_TURNS = 20;
const KEEP_RECENT_TURNS = 10;

interface RequestPayload {
  message: string;
  conversation_id?: string | null;
}

interface ToolCallRecord {
  name: string;
  input: Record<string, unknown>;
  summary: string;
}

const TOOLS: AnthropicToolDefinition[] = [
  {
    name: "search_clients",
    description:
      "Search for a client/tenant by name (fuzzy match). Use this whenever the user mentions a specific client by name and you don't already have their tenant_id from earlier in this conversation. Returns matching clients with their tenant_id, name, and status. If there are multiple close matches, ask the user which one they mean rather than guessing — never assume which client is meant when the name is ambiguous.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The client/company name to search for, as mentioned by the user" },
      },
      required: ["name"],
    },
  },
  {
    name: "get_client_context",
    description:
      "Get a combined snapshot of structured facts for one client/tenant: package and phase status, tasks, action items, documents, hours logged, recent notes/emails, the compliance audit register, the portal user roster and invite status, and recent cross-source timeline activity. Call this after resolving a tenant_id via search_clients (or if you already know it from earlier in this conversation) whenever the user asks about a specific client's current state, history, or activity.",
    input_schema: {
      type: "object",
      properties: {
        tenant_id: {
          type: "number",
          description: "The tenant's numeric id, from an earlier search_clients call or already known from this conversation",
        },
      },
      required: ["tenant_id"],
    },
  },
  {
    name: "search_notes_and_emails",
    description:
      "Semantic search over a client's full historical notes and emails — not just the most-recent handful get_client_context returns. Use this when the user asks about something from the past that might not be recent, e.g. \"what did we discuss with them about X\" or \"has this come up before\". Requires a tenant_id (resolve via search_clients first if you don't already have it).",
    input_schema: {
      type: "object",
      properties: {
        tenant_id: { type: "number", description: "The tenant's numeric id" },
        query: { type: "string", description: "What to search for, in natural language" },
      },
      required: ["tenant_id", "query"],
    },
  },
  {
    name: "search_eos",
    description:
      "Semantic search over Vivacity's own internal EOS (Entrepreneurial Operating System) meeting content — headlines, issues, to-dos, rocks, and cascading messages from leadership meetings. Not tenant/client-specific. Use this for questions about Vivacity's own internal operations, priorities, or meeting history.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to search for, in natural language" },
      },
      required: ["query"],
    },
  },
  {
    name: "search_documents",
    description:
      "Semantic search over the extracted text content of a client's real generated documents (release documents, compliance pack exports, generated Excel deliverables) — not the document metadata get_client_context returns, the actual document content. Use this when the user asks what a specific generated document actually says or contains. May return no matches even for a client with documents listed elsewhere, since not every generated-document row has real extractable content (some are placeholders with no underlying file).",
    input_schema: {
      type: "object",
      properties: {
        tenant_id: { type: "number", description: "The tenant's numeric id" },
        query: { type: "string", description: "What to search for, in natural language" },
      },
      required: ["tenant_id", "query"],
    },
  },
  {
    name: "list_clients_for_staff",
    description:
      "Find which clients/tenants a Vivacity staff member currently manages, as CSC (Client Success Consultant). Give a name (first name is fine) and this resolves the staff member and returns their active client assignments. If the name is ambiguous (matches multiple staff), it returns the candidates instead — ask the user which one is meant rather than guessing.",
    input_schema: {
      type: "object",
      properties: {
        staff_name: { type: "string", description: "The staff member's name (first name, last name, or both) as mentioned by the user" },
      },
      required: ["staff_name"],
    },
  },
  {
    name: "search_standards",
    description:
      "Semantic search over the regulatory standards corpus — Standards for RTOs 2025, National Code 2018, ESOS Act, and related practice guides (the same corpus the existing Compliance mode panel uses). Not tenant/client-specific. Use this for questions about what a specific standard, clause, or regulatory requirement actually says, as distinct from a question about a specific client's own compliance status.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to search for, in natural language" },
      },
      required: ["query"],
    },
  },
];

const SYSTEM_PROMPT = `You are Ask Viv Assistant, an internal conversational assistant for Vivacity staff working with Unicorn, the RTO compliance management platform.

You are read-only. You never create, update, delete, approve, or submit anything, and you never draft anything intended to be sent directly to a client.

You have tools to look up real data (clients, facts, notes, documents). Use them whenever a question needs real information you don't already have from earlier in this conversation — never fabricate a client name, fact, date, or figure that a tool didn't actually return. If a tool returns nothing relevant, say so plainly rather than guessing.

When you reference something a tool returned, make it clear what it's based on (e.g. "according to the client record...") so the person you're talking to can tell what's grounded in real data versus your own general knowledge.

When search_standards returns regulatory text (Standards for RTOs, National Code, ESOS Act, practice guides), paraphrase it in your own words rather than reproducing it at length — short quotes (a clause title, a key phrase) are fine, but don't dump long verbatim passages. The retrieved text is a draft aid for you, not the final word — note that the approved policy suite and a Vivacity consultant's advice are the authoritative source for regulatory interpretation.

Write naturally — you don't need to follow any fixed section structure. Keep answers focused and easy to read.`;

/** Whether this user is in the Ask Viv Assistant rollout — master flag, then Super Admin / beta / all-staff rings. */
async function isAssistantEnabledForUser(supabase: any, userId: string, profile: UserProfile): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("ask_viv_assistant_enabled, ask_viv_assistant_beta_user_ids, ask_viv_assistant_all_staff")
      .limit(1)
      .maybeSingle();

    if (!data?.ask_viv_assistant_enabled) return false;
    if (data.ask_viv_assistant_all_staff) return true;
    if (checkSuperAdmin(profile)) return true;
    const betaUserIds: string[] = data.ask_viv_assistant_beta_user_ids || [];
    return betaUserIds.includes(userId);
  } catch (err) {
    console.error("Failed to check Ask Viv Assistant rollout flag:", err);
    return false;
  }
}

/** Check today's cumulative usage against the configured daily cap, before doing any real work. */
async function checkUsageCap(
  supabase: any,
  userId: string
): Promise<{ withinCap: boolean; used: number; cap: number; unlimited: boolean }> {
  const { data: settings } = await supabase
    .from("app_settings")
    .select("ask_viv_assistant_daily_token_cap, ask_viv_assistant_unlimited_user_ids")
    .limit(1)
    .maybeSingle();
  const cap = settings?.ask_viv_assistant_daily_token_cap ?? 500_000;
  const unlimitedUserIds: string[] = settings?.ask_viv_assistant_unlimited_user_ids || [];
  const unlimited = unlimitedUserIds.includes(userId);

  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await supabase
    .from("ask_viv_assistant_usage")
    .select("input_tokens, output_tokens")
    .eq("user_id", userId)
    .eq("usage_date", today)
    .maybeSingle();
  const used = (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0);

  // Exempt users skip the cap entirely — still tracked (recordUsage runs
  // unconditionally below) so their usage is visible, just never blocking.
  return { withinCap: unlimited || used < cap, used, cap, unlimited };
}

/** Record actual token usage from this request, upserting today's row. */
async function recordUsage(supabase: any, userId: string, inputTokens: number, outputTokens: number): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { data: existing } = await supabase
      .from("ask_viv_assistant_usage")
      .select("input_tokens, output_tokens, request_count")
      .eq("user_id", userId)
      .eq("usage_date", today)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("ask_viv_assistant_usage")
        .update({
          input_tokens: existing.input_tokens + inputTokens,
          output_tokens: existing.output_tokens + outputTokens,
          request_count: existing.request_count + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("usage_date", today);
    } else {
      await supabase.from("ask_viv_assistant_usage").insert({
        user_id: userId,
        usage_date: today,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        request_count: 1,
      });
    }
  } catch (err) {
    console.error("Failed to record Ask Viv Assistant usage:", err);
  }
}

/** Execute a tool call by name. Phase B: search_clients + get_client_context. */
async function executeTool(
  name: string,
  input: Record<string, unknown>,
  supabase: any,
  profile: UserProfile
): Promise<{ result: unknown; summary: string }> {
  if (name === "search_clients") {
    const nameQuery = String(input.name ?? "").trim();
    if (!nameQuery) {
      return { result: { error: "No name provided" }, summary: "search_clients called with no name" };
    }
    const { data, error } = await supabase
      .from("tenants")
      .select("id, name, status")
      .ilike("name", `%${nameQuery}%`)
      .limit(10);

    if (error) {
      return { result: { error: error.message }, summary: `search_clients("${nameQuery}") failed` };
    }
    const matches = (data || []).map((t: any) => ({ tenant_id: t.id, name: t.name, status: t.status }));
    return {
      result: { matches },
      summary:
        matches.length === 0
          ? `search_clients("${nameQuery}") — no matches`
          : `search_clients("${nameQuery}") — ${matches.length} match(es): ${matches.map((m: any) => m.name).join(", ")}`,
    };
  }

  if (name === "get_client_context") {
    const tenantId = Number(input.tenant_id);
    if (!tenantId || Number.isNaN(tenantId)) {
      return { result: { error: "No valid tenant_id provided" }, summary: "get_client_context called with no valid tenant_id" };
    }

    try {
      const factBuilderInput: AskVivFactBuilderInput = {
        user_id: profile.user_uuid,
        tenant_id: tenantId,
        role: profile.unicorn_role || "unknown",
        now_iso: new Date().toISOString(),
        timezone: "Australia/Sydney",
      };
      const factsResult = await buildAskVivFacts(supabase, factBuilderInput);

      if (factsResult.facts.length === 0 && factsResult.gaps.includes("Tenant not found or access denied")) {
        return { result: { error: "Tenant not found" }, summary: `get_client_context(${tenantId}) — tenant not found` };
      }

      return {
        result: { facts_summary: formatFactsForLLM(factsResult.facts), gaps: factsResult.gaps },
        summary: `get_client_context(${tenantId}) — ${factsResult.facts.length} fact(s), ${factsResult.gaps.length} gap(s)`,
      };
    } catch (err) {
      return {
        result: { error: err instanceof Error ? err.message : String(err) },
        summary: `get_client_context(${tenantId}) failed`,
      };
    }
  }

  if (name === "search_notes_and_emails") {
    const tenantId = Number(input.tenant_id);
    const query = String(input.query ?? "").trim();
    if (!tenantId || Number.isNaN(tenantId) || !query) {
      return { result: { error: "tenant_id and query are both required" }, summary: "search_notes_and_emails called with missing params" };
    }
    try {
      const embedding = await generateEmbedding(query);
      const { data, error } = await supabase.rpc("match_ask_viv_corpus", {
        query_embedding: embedding,
        match_threshold: 0.3,
        match_count: 16,
        filter_tenant_id: tenantId,
        filter_source_type: null,
      });
      if (error) throw new Error(error.message);
      const matches = (data || [])
        .filter((r: any) => r.source_type === "note" || r.source_type === "email")
        .slice(0, 8);
      return {
        result: {
          matches: matches.map((m: any) => ({
            source_type: m.source_type,
            heading: m.heading,
            content: m.content,
            similarity: m.similarity,
          })),
        },
        summary:
          matches.length === 0
            ? `search_notes_and_emails(${tenantId}, "${query}") — no matches`
            : `search_notes_and_emails(${tenantId}, "${query}") — ${matches.length} match(es)`,
      };
    } catch (err) {
      return {
        result: { error: err instanceof Error ? err.message : String(err) },
        summary: `search_notes_and_emails(${tenantId}, "${query}") failed`,
      };
    }
  }

  if (name === "search_eos") {
    const query = String(input.query ?? "").trim();
    if (!query) {
      return { result: { error: "query is required" }, summary: "search_eos called with no query" };
    }
    try {
      const embedding = await generateEmbedding(query);
      const { data, error } = await supabase.rpc("match_ask_viv_corpus", {
        query_embedding: embedding,
        match_threshold: 0.3,
        match_count: 8,
        filter_tenant_id: null,
        filter_source_type: "eos",
      });
      if (error) throw new Error(error.message);
      const matches = data || [];
      return {
        result: { matches: matches.map((m: any) => ({ heading: m.heading, content: m.content, similarity: m.similarity })) },
        summary: matches.length === 0 ? `search_eos("${query}") — no matches` : `search_eos("${query}") — ${matches.length} match(es)`,
      };
    } catch (err) {
      return {
        result: { error: err instanceof Error ? err.message : String(err) },
        summary: `search_eos("${query}") failed`,
      };
    }
  }

  if (name === "search_documents") {
    const tenantId = Number(input.tenant_id);
    const query = String(input.query ?? "").trim();
    if (!tenantId || Number.isNaN(tenantId) || !query) {
      return { result: { error: "tenant_id and query are both required" }, summary: "search_documents called with missing params" };
    }
    try {
      const embedding = await generateEmbedding(query);
      const { data, error } = await supabase.rpc("match_ask_viv_corpus", {
        query_embedding: embedding,
        match_threshold: 0.3,
        match_count: 8,
        filter_tenant_id: tenantId,
        filter_source_type: "document",
      });
      if (error) throw new Error(error.message);
      const matches = data || [];
      return {
        result: { matches: matches.map((m: any) => ({ heading: m.heading, content: m.content, similarity: m.similarity })) },
        summary:
          matches.length === 0
            ? `search_documents(${tenantId}, "${query}") — no matches`
            : `search_documents(${tenantId}, "${query}") — ${matches.length} match(es)`,
      };
    } catch (err) {
      return {
        result: { error: err instanceof Error ? err.message : String(err) },
        summary: `search_documents(${tenantId}, "${query}") failed`,
      };
    }
  }

  if (name === "list_clients_for_staff") {
    const staffName = String(input.staff_name ?? "").trim();
    if (!staffName) {
      return { result: { error: "No staff_name provided" }, summary: "list_clients_for_staff called with no name" };
    }

    // A "First Last" query never matches first_name or last_name individually
    // via a single ilike (neither column contains the full combined string) —
    // match per word instead, against any of the three fields, then prefer
    // candidates where every word appears somewhere across name+email.
    const words = staffName.split(/\s+/).filter(Boolean);
    const orConditions = words.flatMap((w) => [`first_name.ilike.%${w}%`, `last_name.ilike.%${w}%`, `email.ilike.%${w}%`]).join(",");

    const { data: candidates, error: staffErr } = await supabase
      .from("users")
      .select("user_uuid, first_name, last_name, email, unicorn_role")
      .eq("is_vivacity_internal", true)
      .eq("disabled", false)
      .eq("archived", false)
      .or(orConditions)
      .limit(25);

    if (staffErr) {
      return { result: { error: staffErr.message }, summary: `list_clients_for_staff("${staffName}") failed` };
    }

    const allCandidates = candidates || [];
    const fullMatches = allCandidates.filter((u: any) => {
      const haystack = `${u.first_name ?? ""} ${u.last_name ?? ""} ${u.email ?? ""}`.toLowerCase();
      return words.every((w) => haystack.includes(w.toLowerCase()));
    });
    const staff = (fullMatches.length > 0 ? fullMatches : allCandidates).slice(0, 10);
    if (staff.length === 0) {
      return { result: { matches: [] }, summary: `list_clients_for_staff("${staffName}") — no staff matched` };
    }
    if (staff.length > 1) {
      return {
        result: {
          staff_matches: staff.map((s: any) => ({
            user_id: s.user_uuid,
            name: `${s.first_name} ${s.last_name}`,
            email: s.email,
            role: s.unicorn_role,
          })),
        },
        summary: `list_clients_for_staff("${staffName}") — ${staff.length} staff match(es), ambiguous`,
      };
    }

    const staffMember = staff[0];
    // No FK constraint exists from tenant_csc_assignments.tenant_id to
    // tenants.id, so PostgREST can't auto-embed — fetch tenants separately
    // and merge client-side. Filter matches useCscAssignments.ts exactly
    // (the hook behind Manage Clients' own CSC filter): is_primary = true
    // and ended_at is null — deliberately NOT also checking superseded_at,
    // to stay consistent with what that page already shows for this staff
    // member.
    const { data: assignments, error: assignErr } = await supabase
      .from("tenant_csc_assignments")
      .select("tenant_id, role_label, is_primary, assigned_since")
      .eq("csc_user_id", staffMember.user_uuid)
      .eq("is_primary", true)
      .is("ended_at", null);

    if (assignErr) {
      return {
        result: { error: assignErr.message },
        summary: `list_clients_for_staff("${staffName}") — assignment lookup failed`,
      };
    }

    const tenantIds = (assignments || []).map((a: any) => a.tenant_id);
    const tenantsById = new Map<number, { name: string; status: string }>();
    if (tenantIds.length > 0) {
      const { data: tenantRows } = await supabase.from("tenants").select("id, name, status").in("id", tenantIds);
      for (const t of tenantRows || []) {
        tenantsById.set(t.id, { name: t.name, status: t.status });
      }
    }

    const clients = (assignments || []).map((a: any) => ({
      tenant_id: a.tenant_id,
      name: tenantsById.get(a.tenant_id)?.name ?? null,
      status: tenantsById.get(a.tenant_id)?.status ?? null,
      role_label: a.role_label,
      is_primary: a.is_primary,
      assigned_since: a.assigned_since,
    }));

    return {
      result: {
        staff: { name: `${staffMember.first_name} ${staffMember.last_name}`, email: staffMember.email, role: staffMember.unicorn_role },
        clients,
      },
      summary:
        `list_clients_for_staff("${staffName}") — resolved to ${staffMember.first_name} ${staffMember.last_name}, ` +
        `${clients.length} active client(s)`,
    };
  }

  if (name === "search_standards") {
    const query = String(input.query ?? "").trim();
    if (!query) {
      return { result: { error: "query is required" }, summary: "search_standards called with no query" };
    }
    try {
      const embedding = await generateEmbedding(query);
      const { data, error } = await supabase.rpc("match_srto_chunks", {
        query_embedding: embedding,
        match_threshold: 0.5,
        match_count: 8,
        filter_source_type: null,
        filter_framework: null,
        filter_clause: null,
      });
      if (error) throw new Error(error.message);
      const matches = data || [];
      return {
        result: {
          matches: matches.map((m: any) => ({
            source_document: m.source_document,
            framework: m.framework,
            clause: m.clause,
            heading: m.heading,
            content: m.content,
            similarity: m.similarity,
          })),
        },
        summary:
          matches.length === 0
            ? `search_standards("${query}") — no matches`
            : `search_standards("${query}") — ${matches.length} match(es)`,
      };
    } catch (err) {
      return {
        result: { error: err instanceof Error ? err.message : String(err) },
        summary: `search_standards("${query}") failed`,
      };
    }
  }

  return { result: { error: `Unknown tool: ${name}` }, summary: `Unknown tool: ${name}` };
}

/**
 * Fold older turns into context_summary once raw turn count crosses the
 * threshold, via a cheap Haiku call — a mechanical summarization sub-task,
 * not the main conversational response, so it doesn't need Sonnet's quality.
 * Keeps long-running conversations from ever hitting a hard context-window
 * wall, and keeps per-turn cost bounded as a conversation grows.
 */
async function maybeSummarizeConversation(
  supabase: any,
  conversationId: string,
  contextSummary: string | null,
  summaryCoversTurns: number
): Promise<{ contextSummary: string | null; summaryCoversTurns: number }> {
  const { count } = await supabase
    .from("ask_viv_turns")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId);
  const totalTurns = count ?? 0;

  const toSummarizeCount = totalTurns - KEEP_RECENT_TURNS - summaryCoversTurns;
  if (totalTurns - summaryCoversTurns <= SUMMARIZE_TRIGGER_TURNS || toSummarizeCount <= 0) {
    return { contextSummary, summaryCoversTurns };
  }

  const { data: turnsToSummarize } = await supabase
    .from("ask_viv_turns")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .range(summaryCoversTurns, summaryCoversTurns + toSummarizeCount - 1);

  if (!turnsToSummarize || turnsToSummarize.length === 0) {
    return { contextSummary, summaryCoversTurns };
  }

  const transcript = turnsToSummarize.map((t: any) => `${t.role}: ${t.content}`).join("\n\n");
  const summaryPrompt = contextSummary
    ? `Existing summary so far:\n${contextSummary}\n\nNew turns to fold in:\n${transcript}`
    : `Conversation turns to summarize:\n${transcript}`;

  try {
    const haikuResp = await callAnthropicHaiku({
      system:
        "Summarize this internal staff assistant conversation concisely, preserving any client names, tenant IDs, and specific facts mentioned, so a later turn can pick up context without re-reading the full history. Output only the summary text, no preamble.",
      messages: [{ role: "user", content: summaryPrompt }],
    });
    const newSummary = extractText(haikuResp).trim() || contextSummary;
    const newCoversTurns = summaryCoversTurns + turnsToSummarize.length;

    await supabase
      .from("ask_viv_conversations")
      .update({ context_summary: newSummary, context_summary_covers_turns: newCoversTurns })
      .eq("id", conversationId);

    return { contextSummary: newSummary, summaryCoversTurns: newCoversTurns };
  } catch (err) {
    console.error("Conversation summarization failed, continuing without it:", err);
    return { contextSummary, summaryCoversTurns };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonError(405, "METHOD_NOT_ALLOWED", "Only POST requests are accepted");
  }

  try {
    const token = extractToken(req);
    if (!token) {
      return jsonError(401, "UNAUTHORIZED", "No authorization token provided");
    }

    const supabase = createServiceClient();
    const { user, profile, error: authError } = await verifyAuth(supabase, token);
    if (authError || !user || !profile) {
      return jsonError(401, "UNAUTHORIZED", authError || "Authentication failed");
    }

    const accessCheck = await validateAskVivAccess(supabase, user.id, profile, "ask-viv-assistant");
    if (!accessCheck.allowed) {
      return askVivAccessDeniedResponse(accessCheck.reason);
    }

    const enabled = await isAssistantEnabledForUser(supabase, user.id, profile);
    if (!enabled) {
      return jsonError(403, "NOT_ENABLED", "Ask Viv Assistant isn't available for your account yet.");
    }

    let payload: RequestPayload;
    try {
      payload = await req.json();
    } catch {
      return jsonError(400, "BAD_REQUEST", "Invalid JSON body");
    }

    const message = payload.message?.trim();
    if (!message) {
      return jsonError(400, "BAD_REQUEST", "message is required");
    }

    // Conversations for this assistant are never tenant-pinned at the
    // conversation level — a single conversation can range across multiple
    // clients over time. Scoping happens per tool call instead.
    const conversationId = await resolveOrCreateConversation(supabase, user.id, null, payload.conversation_id, message);
    await logTurn(supabase, conversationId, "user", message, "assistant");

    const { withinCap } = await checkUsageCap(supabase, user.id);
    if (!withinCap) {
      const limitMessage = "You've reached today's usage limit for Ask Viv Assistant. It resets tomorrow.";
      await logTurn(supabase, conversationId, "assistant", limitMessage, "assistant");
      return jsonRaw({ content: limitMessage, conversation_id: conversationId, sources_used: [], limited: true });
    }

    // Load + (if needed) refresh the conversation's summarized context before
    // building this turn's prompt, so the bound on raw history is correct.
    let { contextSummary, summaryCoversTurns, recentTurns } = await loadConversationContext(
      supabase,
      conversationId,
      KEEP_RECENT_TURNS * 2 // fetch a bit more than we'll keep, trimmed below
    );
    const summarized = await maybeSummarizeConversation(supabase, conversationId, contextSummary, summaryCoversTurns);
    contextSummary = summarized.contextSummary;
    summaryCoversTurns = summarized.summaryCoversTurns;

    const systemText = contextSummary
      ? `${SYSTEM_PROMPT}\n\nEarlier conversation summary:\n${contextSummary}`
      : SYSTEM_PROMPT;

    // recentTurns already includes the just-logged user turn (last item) —
    // exclude it since it's added explicitly below, and cap to the most
    // recent KEEP_RECENT_TURNS prior turns.
    const priorTurns = recentTurns.slice(0, -1).slice(-KEEP_RECENT_TURNS);
    const loopMessages: AnthropicMessage[] = [
      ...priorTurns.map((t) => ({ role: t.role, content: t.content } as AnthropicMessage)),
      { role: "user", content: message },
    ];

    const allResponses: AnthropicResponse[] = [];
    const toolCalls: ToolCallRecord[] = [];
    let finalText: string | null = null;

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await callAnthropic({
        model: CLAUDE_SONNET_MODEL,
        system: systemText,
        messages: loopMessages,
        tools: TOOLS,
        max_tokens: 4096,
      });
      allResponses.push(response);

      if (response.stop_reason !== "tool_use") {
        if (response.stop_reason === "max_tokens") {
          // Response was cut off mid-generation, not a natural completion —
          // log it so a real truncation is visible in edge function logs
          // rather than silently shipping partial text as if it were final.
          console.warn("Ask Viv Assistant response hit max_tokens and was truncated");
        }
        finalText = extractText(response);
        break;
      }

      loopMessages.push({ role: "assistant", content: response.content });
      const toolUses = extractToolUses(response);
      const toolResultBlocks = [];
      for (const tu of toolUses) {
        const { result, summary } = await executeTool(tu.name, tu.input, supabase, profile);
        toolCalls.push({ name: tu.name, input: tu.input, summary });
        toolResultBlocks.push({ type: "tool_result" as const, tool_use_id: tu.id, content: JSON.stringify(result) });
      }
      loopMessages.push({ role: "user", content: toolResultBlocks });
    }

    if (finalText === null) {
      // Hit the iteration cap without a natural stop — force a text-only
      // response (no tools offered) using whatever's already been gathered,
      // rather than returning a bare "I hit my limit" message.
      try {
        const forced = await callAnthropic({
          model: CLAUDE_SONNET_MODEL,
          system: systemText,
          messages: loopMessages,
          max_tokens: 4096,
        });
        allResponses.push(forced);
        finalText = extractText(forced).trim();
      } catch (err) {
        console.error("Forced final response failed:", err);
      }
      if (!finalText) {
        finalText = "I gathered some information but couldn't finish forming an answer — try rephrasing your question to be more specific.";
      }
    }

    const usage = sumUsage(allResponses);
    await recordUsage(supabase, user.id, usage.input_tokens, usage.output_tokens);

    const sourcesUsed = toolCalls.map((tc) => ({ tool: tc.name, summary: tc.summary }));

    try {
      await supabase.from("ai_interaction_logs").insert({
        user_id: user.id,
        tenant_id: null,
        mode: "ask_viv_assistant",
        prompt_text: message,
        response_text: finalText,
        records_accessed: sourcesUsed,
        conversation_id: conversationId,
        request_context: {
          tool_calls: toolCalls,
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
          round_trips: allResponses.length,
        },
      });
    } catch (err) {
      console.error("Failed to log Ask Viv Assistant interaction:", err);
    }

    await logTurn(supabase, conversationId, "assistant", finalText, "assistant");

    return jsonRaw({
      content: finalText,
      conversation_id: conversationId,
      sources_used: sourcesUsed,
    });
  } catch (err) {
    console.error("Ask Viv Assistant error:", err);
    return jsonError(500, "INTERNAL_ERROR", "An unexpected error occurred");
  }
});
