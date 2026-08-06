/**
 * Ask Viv Assistant — CLIENT surface
 *
 * Sibling of the staff `ask-viv-assistant` — same genuinely-conversational,
 * agentic tool-use architecture (Claude Sonnet direct-Anthropic, no forced
 * Answer/Confidence/Gaps template), but tenant-locked and served to
 * client-portal users (unicorn_role Admin/User) instead of Vivacity staff.
 *
 * Replaces `compliance-assistant-client` (deterministic, Gemini-phrased) as
 * the client-facing Ask Viv. See
 * docs/audit-log/entries/2026-08-06-ask-viv-client-assistant.md for the full
 * decision record. `compliance-assistant-client` is left deployed but
 * unmounted — decommissioning it is a follow-up once this has run in
 * production for a period, not a same-PR deletion.
 *
 * Key architectural difference from the staff function: this one uses the
 * user-auth (RLS-scoped) Supabase client for every read and for conversation
 * persistence, not a service-role client. Staff are trusted with full
 * access, so service-role + app-layer filtering is an acceptable design
 * there; for a client-facing surface, a bug in a tool's own redaction logic
 * must not be the only thing standing between one tenant's data and
 * another's — Postgres RLS is the actual enforcement boundary here, and the
 * deny-list in `_shared/ask-viv-client-redaction.ts` is a second, belt-and-
 * suspenders layer on top of it, not the primary one. Only the daily-cap
 * upsert against `ai_client_query_usage` needs `createServiceClient()`,
 * matching the exact precedent already shipped in
 * `compliance-assistant-client/index.ts` (tenant members only have SELECT
 * on that table today).
 *
 * Tool catalogue is small and hard-scoped — none of the staff tools
 * (search_clients, compare_clients, get_portfolio_attention, EOS tools,
 * etc.) are exposed here, and no tool ever accepts a tenant_id/client_id
 * from its input: every DB-touching tool closes over the gate-resolved
 * tenant_id from validateClientAskVivAccess. search_standards is
 * deliberately excluded too — regulatory interpretation stays off the
 * client surface (a locked decision carried over unchanged from the
 * original client-mode build spec, docs/kb/handoffs/ask-viv-client-mode.md).
 */

import { createServiceClient, createUserClient } from "../_shared/supabase-client.ts";
import { extractToken, verifyAuth, type UserProfile } from "../_shared/auth-helpers.ts";
import { jsonError, jsonRaw } from "../_shared/response-helpers.ts";
import {
  validateClientAskVivAccess,
  askVivAccessDeniedResponse,
  clientAskVivDenialMessage,
  isVivacityInternal,
} from "../_shared/ask-viv-access.ts";
import { buildAskVivFacts, formatFactsForLLM } from "../_shared/ask-viv-fact-builder/index.ts";
import { filterFactsForClient, buildFriendlyRecords } from "../_shared/ask-viv-client-redaction.ts";
import { findPortalPages } from "../_shared/ask-viv-client-navigation.ts";
import { generateEmbedding } from "../_shared/openai-embeddings.ts";
import {
  callAnthropic,
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

const MAX_TOOL_ITERATIONS = 6;
const DAILY_QUERY_CAP = 20;
// How many prior turns of this conversation to feed back as context. No
// summarization tier for v1 — client conversations are much lower-volume
// than staff ones, so a simple recency window is enough.
const KEEP_RECENT_TURNS = 10;

interface RequestPayload {
  message: string;
  conversation_id?: string | null;
  preview_tenant_id?: number;
}

interface ToolCallRecord {
  name: string;
  input: Record<string, unknown>;
  summary: string;
}

const TOOLS: AnthropicToolDefinition[] = [
  {
    name: "get_my_account_context",
    description:
      "Get a snapshot of your organisation's current account state with Vivacity: package and phase/stage status, tasks, documents/evidence, the compliance audit register, your portal user roster, and recent account activity. Call this whenever the user asks about their own current state, progress, or history. Takes no input — it always resolves to the caller's own account.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "search_my_documents",
    description:
      "Semantic search over the extracted text content of your organisation's real generated documents (release documents, compliance pack exports, generated deliverables) — not the document list get_my_account_context returns, the actual document content. Use this when the user asks what a specific document actually says. Does not search notes, emails, or internal correspondence — those aren't available through Ask Viv.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to search for, in natural language" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_my_academy_progress",
    description:
      "Get the caller's own Vivacity Academy enrolments, course progress, and earned certificates. Use this for questions like 'what courses am I enrolled in' or 'do I have my certificate for X'. Takes no input — always resolves to the caller's own Academy activity, not their organisation's.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "find_portal_page",
    description:
      "Find the right page in the client portal or Vivacity Academy for something the user wants to do or find, e.g. 'where do I find my certificates' or 'how do I raise a support ticket'. Returns matching page(s) with their in-app path — present the result as a clickable link in your answer (e.g. [Certificates](/client/certificate)), don't just state the raw path as plain text.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What the user is trying to find or do, in their own words" },
      },
      required: ["query"],
    },
  },
  {
    name: "list_my_deadlines",
    description:
      "List what's overdue or coming due for your organisation: overdue action items and upcoming compliance audit deadlines. Use this for 'what's overdue' or 'what's due soon' questions.",
    input_schema: {
      type: "object",
      properties: {
        window_days: { type: "number", description: "How many days ahead counts as 'upcoming' for due dates. Defaults to 90." },
      },
      required: [],
    },
  },
  {
    name: "get_invite_status",
    description:
      "Check the status of your organisation's portal users and pending invites — including secondary contacts and Academy-only learners (all managed from the same Users page). Diagnoses why an invite might not be working (expired link, bounced/failed delivery, never signed in) and what to do about it. Use this for 'why isn't my invite working', 'has X accepted their invite yet', or before inviting someone new — it also explains where to go to send a new invite. You are read-only: you can diagnose and point them to the right page, but you cannot resend an invite yourself.",
    input_schema: {
      type: "object",
      properties: {
        person: { type: "string", description: "Optional: a name or email to check one specific person. Omit to see everyone's invite/membership status." },
      },
      required: [],
    },
  },
];

const SYSTEM_PROMPT = `You are Ask Viv, a conversational assistant for client-portal users of Unicorn by ComplyHub — the compliance management platform Vivacity uses to run RTO governance consulting engagements.

You only know about the caller's own organisation's account. You have no visibility into any other client, and you never claim to. You are read-only — you never create, update, delete, approve, or submit anything.

You have tools to look up real data about the caller's own account and to find the right page in the client portal or Vivacity Academy. Use them whenever a question needs real information you don't already have from earlier in this conversation — never fabricate a fact, date, figure, or page path a tool didn't actually return. If a tool returns nothing relevant, say so plainly rather than guessing.

You do not have access to regulatory/Standards interpretation (Standards for RTOs 2025, National Code, CRICOS, or similar) — if asked a regulatory question, say so and suggest they speak with their Vivacity consultant, rather than answering from general knowledge.

When find_portal_page returns a page, present it as a markdown link using its path, e.g. [My Courses](/academy/courses), so the person can click straight there.

For invite questions, use get_invite_status to diagnose the real cause (expired link, bounced email, never signed in) rather than guessing — then tell them exactly where to go to fix it or invite someone new: Users in the client portal, for anyone (secondary contacts, team members, and Academy-only learners are all invited from there — Academy-only is a role option on that page, not a separate flow). You cannot resend an invite yourself — point them to the right page to do it.

Write naturally in Australian English — you don't need to follow any fixed section structure. Keep answers concise and easy to read. If something in your answer might not match what the person expected, mention that their Vivacity consultant can help — don't try to resolve genuine account discrepancies yourself.`;

/** Rollout gate: master flag, then all-tenants or beta-ring for this specific tenant. */
async function isClientAssistantEnabledForTenant(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  tenantId: number
): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("ask_viv_client_assistant_enabled, ask_viv_client_assistant_all_tenants, ask_viv_client_assistant_beta_tenant_ids")
      .limit(1)
      .maybeSingle();

    if (!data?.ask_viv_client_assistant_enabled) return false;
    if (data.ask_viv_client_assistant_all_tenants) return true;
    // bigint[] columns can come back as strings (precision-safe serialisation) —
    // compare numerically rather than with .includes(), which is strict-equality
    // and silently fails on a "7547" vs 7547 mismatch.
    const betaTenantIds: (number | string)[] = data.ask_viv_client_assistant_beta_tenant_ids || [];
    return betaTenantIds.some((id) => Number(id) === tenantId);
  } catch (err) {
    console.error("Failed to check Ask Viv client assistant rollout flag:", err);
    return false;
  }
}

/** Token-based daily cap — checked in addition to the request-count cap (ai_client_query_usage), since an agentic tool-use loop's cost per request varies far more than the deterministic function that cap was ported from. */
async function checkClientTokenUsageCap(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string
): Promise<{ withinCap: boolean; used: number; cap: number }> {
  const { data: settings } = await supabase
    .from("app_settings")
    .select("ask_viv_client_assistant_daily_token_cap")
    .limit(1)
    .maybeSingle();
  const cap = settings?.ask_viv_client_assistant_daily_token_cap ?? 50_000;

  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await supabase
    .from("ask_viv_client_assistant_usage")
    .select("input_tokens, output_tokens")
    .eq("user_id", userId)
    .eq("usage_date", today)
    .maybeSingle();
  const used = (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0);

  return { withinCap: used < cap, used, cap };
}

/** Record actual token usage from this request, upserting today's row — service-role, matching the staff table's precedent. */
async function recordClientTokenUsage(
  // deno-lint-ignore no-explicit-any
  serviceClient: any,
  userId: string,
  inputTokens: number,
  outputTokens: number
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const { data: existing } = await serviceClient
      .from("ask_viv_client_assistant_usage")
      .select("input_tokens, output_tokens, request_count")
      .eq("user_id", userId)
      .eq("usage_date", today)
      .maybeSingle();

    if (existing) {
      await serviceClient
        .from("ask_viv_client_assistant_usage")
        .update({
          input_tokens: existing.input_tokens + inputTokens,
          output_tokens: existing.output_tokens + outputTokens,
          request_count: existing.request_count + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("usage_date", today);
    } else {
      await serviceClient.from("ask_viv_client_assistant_usage").insert({
        user_id: userId,
        usage_date: today,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        request_count: 1,
      });
    }
  } catch (err) {
    console.error("Failed to record Ask Viv client assistant token usage:", err);
  }
}

/** Resolve an existing conversation the caller owns, or start a new one for this tenant. */
async function resolveOrCreateClientConversation(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  tenantId: number,
  requestedConversationId: string | null | undefined,
  firstMessage: string
): Promise<string> {
  if (requestedConversationId) {
    const { data } = await supabase
      .from("ask_viv_client_conversations")
      .select("id")
      .eq("id", requestedConversationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (data) {
      await supabase
        .from("ask_viv_client_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", requestedConversationId);
      return requestedConversationId;
    }
  }

  const title = firstMessage.length > 80 ? `${firstMessage.slice(0, 77)}...` : firstMessage;
  const { data: created, error } = await supabase
    .from("ask_viv_client_conversations")
    .insert({ user_id: userId, tenant_id: tenantId, title })
    .select("id")
    .single();

  if (error || !created) {
    console.error("Failed to create ask_viv_client_conversations row:", error);
    return crypto.randomUUID();
  }
  return created.id;
}

/** Best-effort turn log — never fails the request. */
async function logClientTurn(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  toolCallsSummary?: ToolCallRecord[]
): Promise<void> {
  try {
    const { error } = await supabase.from("ask_viv_client_turns").insert({
      conversation_id: conversationId,
      role,
      content,
      tool_calls_summary: toolCallsSummary && toolCallsSummary.length > 0 ? toolCallsSummary : null,
    });
    if (error) console.error(`Failed to log client ${role} turn:`, error);
  } catch (err) {
    console.error(`Failed to log client ${role} turn:`, err);
  }
}

async function loadRecentTurns(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  conversationId: string,
  limit: number
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const { data } = await supabase
    .from("ask_viv_client_turns")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).reverse();
}

async function executeClientTool(
  name: string,
  input: Record<string, unknown>,
  // deno-lint-ignore no-explicit-any
  supabase: any,
  tenantId: number,
  userId: string,
  profile: UserProfile,
  lastMessage: string
): Promise<{ result: unknown; summary: string }> {
  if (name === "get_my_account_context") {
    try {
      const factsResult = await buildAskVivFacts(supabase, {
        user_id: userId,
        tenant_id: tenantId,
        role: profile.unicorn_role ?? "User",
        caller_role_class: "client",
        scope: { client_id: null, package_id: null, phase_id: null },
        now_iso: new Date().toISOString(),
        timezone: "Australia/Sydney",
        question: lastMessage,
      });
      const safeFacts = filterFactsForClient(factsResult.facts);
      return {
        result: { facts_summary: formatFactsForLLM(safeFacts), records_looked_at: buildFriendlyRecords(safeFacts) },
        summary: `get_my_account_context() — ${safeFacts.length} fact(s)`,
      };
    } catch (err) {
      return { result: { error: err instanceof Error ? err.message : String(err) }, summary: "get_my_account_context failed" };
    }
  }

  if (name === "search_my_documents") {
    const query = String(input.query ?? "").trim();
    if (!query) {
      return { result: { error: "query is required" }, summary: "search_my_documents called with no query" };
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
        summary: matches.length === 0 ? `search_my_documents("${query}") — no matches` : `search_my_documents("${query}") — ${matches.length} match(es)`,
      };
    } catch (err) {
      return { result: { error: err instanceof Error ? err.message : String(err) }, summary: `search_my_documents("${query}") failed` };
    }
  }

  if (name === "get_my_academy_progress") {
    try {
      const { data: enrolments, error: enrErr } = await supabase
        .from("academy_enrollments")
        .select("id, course_id, status, completed_at, academy_courses(title)")
        .eq("user_id", userId)
        .eq("tenant_id", tenantId)
        .limit(50);
      if (enrErr) throw new Error(enrErr.message);

      const { data: certificates, error: certErr } = await supabase
        .from("academy_certificates")
        .select("id, course_id, certificate_number, issued_at, academy_courses(title)")
        .eq("user_id", userId)
        .eq("tenant_id", tenantId)
        .limit(50);
      if (certErr) throw new Error(certErr.message);

      const enrolmentList = (enrolments || []).map((e: any) => ({
        course: e.academy_courses?.title ?? `Course ${e.course_id}`,
        status: e.status,
        completed_at: e.completed_at,
      }));
      const certificateList = (certificates || []).map((c: any) => ({
        course: c.academy_courses?.title ?? `Course ${c.course_id}`,
        certificate_number: c.certificate_number,
        issued_at: c.issued_at,
      }));

      return {
        result: { enrolments: enrolmentList, certificates: certificateList },
        summary: `get_my_academy_progress() — ${enrolmentList.length} enrolment(s), ${certificateList.length} certificate(s)`,
      };
    } catch (err) {
      return { result: { error: err instanceof Error ? err.message : String(err) }, summary: "get_my_academy_progress failed" };
    }
  }

  if (name === "find_portal_page") {
    const query = String(input.query ?? "").trim();
    if (!query) {
      return { result: { error: "query is required" }, summary: "find_portal_page called with no query" };
    }
    const matches = findPortalPages(query);
    return {
      result: { pages: matches },
      summary: matches.length === 0 ? `find_portal_page("${query}") — no matches` : `find_portal_page("${query}") — ${matches.length} match(es)`,
    };
  }

  if (name === "list_my_deadlines") {
    const windowDays = Number(input.window_days) > 0 ? Number(input.window_days) : 90;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const windowEnd = new Date(Date.now() + windowDays * 86400000).toISOString().slice(0, 10);

      const { data: overdueItems, error: itemsErr } = await supabase
        .from("client_action_items")
        .select("id, title, due_date, priority, item_type")
        .eq("tenant_id", tenantId)
        .is("completed_at", null)
        .not("due_date", "is", null)
        .lt("due_date", today)
        .order("due_date", { ascending: true })
        .limit(50);
      if (itemsErr) throw new Error(itemsErr.message);

      const { data: auditDueRows, error: auditDueErr } = await supabase
        .from("v_audit_schedule")
        .select("next_due_date, days_until_due")
        .eq("tenant_id", tenantId)
        .not("next_due_date", "is", null)
        .lte("next_due_date", windowEnd)
        .order("next_due_date", { ascending: true })
        .limit(10);
      if (auditDueErr) throw new Error(auditDueErr.message);

      return {
        result: { overdue_action_items: overdueItems || [], upcoming_audit_deadlines: auditDueRows || [] },
        summary: `list_my_deadlines() — ${overdueItems?.length ?? 0} overdue item(s), ${auditDueRows?.length ?? 0} upcoming audit deadline(s)`,
      };
    } catch (err) {
      return { result: { error: err instanceof Error ? err.message : String(err) }, summary: "list_my_deadlines failed" };
    }
  }

  if (name === "get_invite_status") {
    const person = String(input.person ?? "").trim().toLowerCase();
    try {
      const { data: rows, error } = await supabase
        .from("v_client_tenant_users")
        .select("row_type, display_name, email, primary_contact, secondary_contact, access_scope, last_sign_in_at, invited_at, invite_expires_at, delivery_status")
        .eq("tenant_id", tenantId)
        .limit(100);
      if (error) throw new Error(error.message);

      const now = new Date();
      const filtered = (rows || []).filter(
        (u: any) =>
          !person ||
          (u.display_name ?? "").toLowerCase().includes(person) ||
          (u.email ?? "").toLowerCase().includes(person)
      );

      const people = filtered.map((u: any) => {
        let diagnosis: string;
        let recommended_action: string;
        if (u.row_type === "invited") {
          if (u.invite_expires_at && new Date(u.invite_expires_at) < now) {
            diagnosis = "Invite link has expired";
            recommended_action = "Resend the invite — an expired link can't be used to sign in.";
          } else if (u.delivery_status && ["bounced", "failed", "undelivered"].includes(String(u.delivery_status).toLowerCase())) {
            diagnosis = `Invite email failed to deliver (${u.delivery_status})`;
            recommended_action = "Double-check the email address is correct, then resend the invite.";
          } else {
            diagnosis = "Invite sent, not yet accepted";
            recommended_action = "No action needed yet — if it's been a while, you can resend it.";
          }
        } else if (u.row_type === "active" && !u.last_sign_in_at) {
          diagnosis = "Account created but never signed in";
          recommended_action = "Check they received the welcome email, or resend an invite.";
        } else {
          diagnosis = "Active, signed in";
          recommended_action = "No action needed.";
        }
        return {
          name: u.display_name,
          email: u.email,
          role: u.primary_contact
            ? "primary contact"
            : u.secondary_contact
            ? "secondary contact"
            : u.access_scope === "academy_only"
            ? "Academy learner"
            : "portal user",
          status: u.row_type,
          diagnosis,
          recommended_action,
        };
      });

      return {
        result: {
          people,
          how_to_invite_new_person:
            "To invite a new secondary contact, team member, or Academy-only learner, go to Users in the client portal (admin access required) and use Invite user — Academy-only access is one of the role options there, not a separate flow.",
        },
        summary: `get_invite_status(${person || "all"}) — ${people.length} person/people`,
      };
    } catch (err) {
      return { result: { error: err instanceof Error ? err.message : String(err) }, summary: "get_invite_status failed" };
    }
  }

  return { result: { error: `Unknown tool: ${name}` }, summary: `Unknown tool: ${name}` };
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

    const supabase = createUserClient(req.headers.get("Authorization"));
    const { user, profile, error: authError } = await verifyAuth(supabase, token);
    if (authError || !user || !profile) {
      return jsonError(401, "UNAUTHORIZED", authError || "Authentication failed");
    }

    // app_settings' own RLS restricts SELECT to staff (is_super_admin_safe()
    // OR is_vivacity_team_safe()) — a client-tenant user gets zero rows back
    // via the RLS-scoped client regardless of what the row actually
    // contains. Rollout-flag/cap lookups aren't tenant data, so reading them
    // via service-role here doesn't weaken the tenant-isolation boundary the
    // rest of this function relies on the user-auth client for.
    const serviceClient = createServiceClient();

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

    // Clients cannot supply scope — tenant_id always comes from the access
    // gate below, never from the request body.
    for (const forbidden of ["tenant_id", "client_id", "package_id", "phase_id"]) {
      if (forbidden in (payload as Record<string, unknown>)) {
        return jsonError(400, "BAD_REQUEST", `Field '${forbidden}' is not allowed; scope is resolved server-side`);
      }
    }
    if (!isVivacityInternal(profile) && "preview_tenant_id" in (payload as Record<string, unknown>)) {
      return jsonError(400, "BAD_REQUEST", "Field 'preview_tenant_id' is not allowed");
    }

    const access = await validateClientAskVivAccess(
      supabase,
      user.id,
      profile,
      "ask-viv-assistant-client",
      payload.preview_tenant_id
    );
    if (!access.allowed) {
      return askVivAccessDeniedResponse(clientAskVivDenialMessage(access.reason));
    }
    const tenantId = access.tenant_id;

    const enabled = await isClientAssistantEnabledForTenant(serviceClient, tenantId);
    if (!enabled) {
      return jsonError(403, "NOT_ENABLED", "Ask Viv isn't available for your account yet.");
    }

    // Daily cap — reuses the existing ai_client_query_usage table/shape from
    // compliance-assistant-client. SELECT is user-auth (tenant_read RLS);
    // the UPSERT below needs service-role since tenant members only have a
    // SELECT policy on this table today.
    const queryDate = new Date().toISOString().split("T")[0];
    const { data: usageRow } = await supabase
      .from("ai_client_query_usage")
      .select("query_count")
      .eq("user_id", user.id)
      .eq("query_date", queryDate)
      .maybeSingle();
    const priorCount = (usageRow?.query_count as number | undefined) ?? 0;
    if (priorCount >= DAILY_QUERY_CAP) {
      const now = new Date();
      const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
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
          headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(retryAfter), "Cache-Control": "no-store" },
        }
      );
    }

    const tokenCap = await checkClientTokenUsageCap(serviceClient, user.id);
    if (!tokenCap.withinCap) {
      return jsonError(429, "DAILY_LIMIT_REACHED", "You've reached today's usage limit for Ask Viv. It resets tomorrow.");
    }

    const conversationId = await resolveOrCreateClientConversation(supabase, user.id, tenantId, payload.conversation_id, message);
    await logClientTurn(supabase, conversationId, "user", message);

    const recentTurns = await loadRecentTurns(supabase, conversationId, KEEP_RECENT_TURNS * 2);
    // recentTurns already includes the just-logged user turn (last item).
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
        system: SYSTEM_PROMPT,
        messages: loopMessages,
        tools: TOOLS,
        max_tokens: 4096,
      });
      allResponses.push(response);

      if (response.stop_reason !== "tool_use") {
        if (response.stop_reason === "max_tokens") {
          console.warn("Ask Viv client assistant response hit max_tokens and was truncated");
        }
        finalText = extractText(response);
        break;
      }

      loopMessages.push({ role: "assistant", content: response.content });
      const toolUses = extractToolUses(response);
      const toolResultBlocks = [];
      for (const tu of toolUses) {
        const { result, summary } = await executeClientTool(tu.name, tu.input, supabase, tenantId, user.id, profile, message);
        toolCalls.push({ name: tu.name, input: tu.input, summary });
        toolResultBlocks.push({ type: "tool_result" as const, tool_use_id: tu.id, content: JSON.stringify(result) });
      }
      loopMessages.push({ role: "user", content: toolResultBlocks });
    }

    if (finalText === null) {
      try {
        const forced = await callAnthropic({ model: CLAUDE_SONNET_MODEL, system: SYSTEM_PROMPT, messages: loopMessages, max_tokens: 4096 });
        allResponses.push(forced);
        finalText = extractText(forced).trim();
      } catch (err) {
        console.error("Forced final response failed:", err);
      }
      if (!finalText) {
        finalText = "I gathered some information but couldn't finish forming an answer — try rephrasing your question to be more specific.";
      }
    }

    // Usage-cap increment — service-role, matching the existing precedent
    // (tenant members have no INSERT/UPDATE policy on this table today).
    try {
      await serviceClient.from("ai_client_query_usage").upsert(
        { user_id: user.id, tenant_id: tenantId, query_date: queryDate, query_count: priorCount + 1 },
        { onConflict: "user_id,query_date" }
      );
    } catch (err) {
      console.error("ai_client_query_usage upsert failed:", err);
    }
    const tokenUsage = sumUsage(allResponses);
    await recordClientTokenUsage(serviceClient, user.id, tokenUsage.input_tokens, tokenUsage.output_tokens);

    const sourcesUsed = toolCalls.map((tc) => ({ tool: tc.name, summary: tc.summary }));
    await logClientTurn(supabase, conversationId, "assistant", finalText, toolCalls);

    return jsonRaw({ content: finalText, conversation_id: conversationId, sources_used: sourcesUsed });
  } catch (err) {
    console.error("Ask Viv client assistant error:", err);
    return jsonError(500, "INTERNAL_ERROR", "An unexpected error occurred");
  }
});
