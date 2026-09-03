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
 *
 * Phase I (added after live user testing surfaced a second gap): platform-
 * wide/cross-client analytics. Every tool up to this point resolves TO a
 * single client — nothing could answer "who needs attention across my
 * clients" or "which clients have gone quiet". Adds get_portfolio_attention
 * (wraps the existing buildPortfolioFacts, already used by compliance-
 * assistant), rank_clients_by_activity, list_deadlines_and_overdue_work,
 * find_findings_without_remediation, compare_clients,
 * get_stage_health_hotspots, get_consultant_workload_comparison,
 * get_activity_trend, search_notes_across_clients, get_academy_adoption,
 * and list_document_templates (the master template catalogue behind the
 * Manage Documents admin page — distinct from any client's own document
 * records or content).
 *
 * Phase J (added after live user testing surfaced a chronology gap):
 * search_eos is semantic search only — it has no way to know which meeting
 * is "the most recent," so "what happened at the last L10" style questions
 * got an honest but unhelpful "I can't be sure this is the latest one."
 * list_eos_meetings and get_eos_meeting_details query eos_meetings joined to
 * eos_meeting_summaries directly (deterministic, date-grounded), the same
 * "facts vs RAG" split already used for client data — get_eos_meeting_details
 * defaults to the most recently HELD meeting of a given type when no
 * meeting_id is given, resolving owner_id/user_id references to real names.
 *
 * Phase M (added after live user testing surfaced a gap identical in shape
 * to Phase J's): "are there new clients" had no date-grounded answer either
 * — only rank_clients_by_activity existed, which ranks by how busy a client
 * has been, not how new it is. list_new_clients resolves "new" from each
 * tenant's actual onboarding date (client_onboarded_at, falling back to
 * created_at — the same fallback useConsultantAssignment.tsx already uses),
 * and auto-excludes any day an unusually large number of tenants share,
 * since two historical bulk imports (375 tenants on one day, 21 on another)
 * would otherwise be indistinguishable from real same-day signings.
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
import { buildPortfolioFacts } from "../_shared/ask-viv-fact-builder/portfolio-facts.ts";
import { generateEmbedding } from "../_shared/openai-embeddings.ts";
import { corsHeaders } from "../_shared/cors.ts";
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
  // Which client the user is currently looking at in the app (e.g. the
  // Client Detail page), resolved client-side from the current route. A hint
  // only — the assistant still uses its own tools for real data, and the
  // user can ask about a different client at any time.
  page_context?: { tenant_id: number } | null;
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
  {
    name: "get_portfolio_attention",
    description:
      "Get a platform-wide view of which active clients most need attention right now, ranked by an attention score — your own assigned clients first, then the top of the rest of the portfolio. Use this for questions like 'who needs attention across my clients' or 'what should I focus on today'. Important: the attention score itself is coarse right now — several of its inputs (evidence gaps, risk events, overdue compliance tasks) are barely populated platform-wide, so most clients cluster at similar scores. Always lead your answer with the concrete drivers and raw counts (overdue tasks, days since activity, stage health) rather than the bare score number, since the score alone is not very discriminating today.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "rank_clients_by_activity",
    description:
      "Rank active clients by how much of a given activity type happened in a recent time window — either the most active ('who has the most traction/engagement') or the least active ('who's gone quiet / needs a check-in'). Covers notes, timeline events, or logged consulting time. Clients with zero activity in the window are included (with a count of 0) when direction is 'least', so true silence is visible, not just low activity.",
    input_schema: {
      type: "object",
      properties: {
        metric: { type: "string", enum: ["notes", "timeline_events", "time_logged"], description: "What kind of activity to count: 'notes' (structured notes created), 'timeline_events' (cross-source activity feed), or 'time_logged' (consulting hours logged)" },
        window_days: { type: "number", description: "How many days back to look. Defaults to 30 if omitted." },
        direction: { type: "string", enum: ["most", "least"], description: "'most' for highest activity/traction, 'least' for lowest/stalled clients" },
        limit: { type: "number", description: "Max clients to return, default 10, capped at 25" },
      },
      required: ["metric", "direction"],
    },
  },
  {
    name: "list_new_clients",
    description:
      "List clients genuinely newly added/onboarded to Unicorn within a recent window, most recent first. This is the tool for 'are there new clients', 'who's onboarded recently', or 'what clients did we sign this month' — rank_clients_by_activity answers a different question (who's busy right now, not who's new) and will misleadingly surface long-standing clients going through an active period, so don't use it for 'new client' questions. Newness is judged by each client's onboarding date (client_onboarded_at when set, otherwise created_at) — a day where an unusually large number of clients share the exact same date is treated as a historical bulk data-import batch and excluded automatically, so old CSV imports don't get mistaken for new signings; excluded_bulk_import_days in the result tells you if that happened. Returns each match's tenant_id, name, status, package, and assigned CSC — call get_client_context with a tenant_id afterward for that client's full comprehensive snapshot (phase, tasks, documents, recent notes, portal users, etc.) when the user wants details on a specific one.",
    input_schema: {
      type: "object",
      properties: {
        window_days: { type: "number", description: "How many days back counts as 'new'. Defaults to 30." },
        limit: { type: "number", description: "Max clients to return, default 15, capped at 50." },
      },
      required: [],
    },
  },
  {
    name: "list_deadlines_and_overdue_work",
    description:
      "List what's overdue or coming due across the caseload: overdue internal/client action items, overdue compliance audits, and upcoming audit or RTO/CRICOS registration expiries within a window. Optionally scope to one staff member's CSC caseload. This is the tool for 'what's overdue', 'what's due soon', or 'what needs to happen before X' questions.",
    input_schema: {
      type: "object",
      properties: {
        csc_name: { type: "string", description: "Optional: scope to one staff member's assigned clients (as CSC). Omit for platform-wide." },
        window_days: { type: "number", description: "How many days ahead counts as 'upcoming' for due dates/expiries. Defaults to 90." },
      },
      required: [],
    },
  },
  {
    name: "find_findings_without_remediation",
    description:
      "List critical/high-priority compliance audit findings that have no remediation action recorded against them yet — a real compliance-integrity gap, not a hypothetical one. Optionally scope to one client.",
    input_schema: {
      type: "object",
      properties: {
        tenant_id: { type: "number", description: "Optional: scope to one client's tenant_id. Omit for platform-wide." },
      },
      required: [],
    },
  },
  {
    name: "compare_clients",
    description:
      "Side-by-side comparison of 2 or more specific clients: attention score and drivers, overdue task counts, days since activity, burn/renewal risk status, and audit schedule status. Use this when the user names multiple clients and asks how they compare, rather than calling get_client_context once per client.",
    input_schema: {
      type: "object",
      properties: {
        tenant_ids: { type: "array", items: { type: "number" }, description: "The tenant_ids to compare, resolved via search_clients if needed" },
      },
      required: ["tenant_ids"],
    },
  },
  {
    name: "get_stage_health_hotspots",
    description:
      "Find which clients currently have the most at-risk (critical or monitoring) package/phase stages, based on the latest stage health snapshot per stage — not historical snapshots. Optionally scope to one staff member's CSC caseload. Use this for 'which clients have the most at-risk stages' or 'where are the compliance hotspots' questions.",
    input_schema: {
      type: "object",
      properties: {
        csc_name: { type: "string", description: "Optional: scope to one staff member's assigned clients (as CSC). Omit for platform-wide." },
        limit: { type: "number", description: "Max clients to return, default 10, capped at 25" },
      },
      required: [],
    },
  },
  {
    name: "get_consultant_workload_comparison",
    description:
      "Compare CSC/consultant caseloads: weekly assignable hours, current load, remaining capacity, and active client count per staff member. Use this for 'is anyone's caseload unbalanced' or 'who has spare capacity' questions. Not client-specific.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_activity_trend",
    description:
      "Check whether an activity metric (notes, timeline events, or logged time) is trending up or down over consecutive time periods, either for one client or platform-wide. Use this for 'is engagement with this client increasing or decreasing' or similar trend questions — a single get_client_context snapshot can't answer that, only a period-over-period comparison can.",
    input_schema: {
      type: "object",
      properties: {
        tenant_id: { type: "number", description: "Optional: scope to one client. Omit for platform-wide totals." },
        metric: { type: "string", enum: ["notes", "timeline_events", "time_logged"], description: "Which activity to trend" },
        periods: { type: "number", description: "How many consecutive periods to compare, e.g. 3" },
        period_days: { type: "number", description: "Length of each period in days, e.g. 30 for month-over-month" },
      },
      required: ["metric", "periods", "period_days"],
    },
  },
  {
    name: "search_notes_across_clients",
    description:
      "Semantic search over notes and emails across the whole client base (or one staff member's caseload), not one named client — use this for pattern-spotting questions like 'what themes are coming up across my portfolio' or 'which clients have mentioned X recently', where the user hasn't named a specific client. Every result is labelled with which client it came from. For a question about one already-named client, use search_notes_and_emails instead — it's cheaper and more precise.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to search for, in natural language" },
        csc_name: { type: "string", description: "Optional: scope to one staff member's assigned clients (as CSC). Omit for platform-wide." },
        limit: { type: "number", description: "Max results, default 10, capped at 20" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_academy_adoption",
    description:
      "Platform-wide Academy (LMS) adoption snapshot: which clients have Academy access enabled, how many enrolled users/courses/certificates each has. Adoption is low overall (a small minority of clients have any enrolled users), so frame this as an adoption/upsell signal, not a client health signal. Not client-specific by default, but can filter to one tenant.",
    input_schema: {
      type: "object",
      properties: {
        tenant_id: { type: "number", description: "Optional: scope to one client's tenant_id. Omit for a platform-wide summary." },
      },
      required: [],
    },
  },
  {
    name: "list_document_templates",
    description:
      "Browse the master document/template catalogue (the same one behind the Manage Documents admin page) — every template Unicorn has defined platform-wide, independent of any client. This is distinct from get_client_context (a specific client's document records) and search_documents (semantic search within a specific client's generated file content). Use this when the user asks what templates exist in Unicorn generally, e.g. 'do we have a Student Handbook template' or 'what governance templates are available', without naming a client. Note: most templates in the catalogue are still in 'draft' status internally, not 'released' — mention status when it's relevant so the user doesn't assume everything listed is a live, client-facing template.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional: text to search for in template title/description (fuzzy match). Omit to browse by category alone." },
        category: { type: "string", description: "Optional: filter to one category, e.g. 'q4-governance', 'cricos-documents', 'rto_policies_procedures'" },
      },
      required: [],
    },
  },
  {
    name: "list_eos_meetings",
    description:
      "Chronological list of Vivacity's own internal EOS (Entrepreneurial Operating System) leadership meetings that actually took place — skipped or not-yet-held meetings are excluded — most recent first. Returns a one-line synopsis of each (date, rating, headline/issue/rock counts) so you can identify a specific one to look into with get_eos_meeting_details. Not tenant/client-specific.",
    input_schema: {
      type: "object",
      properties: {
        meeting_type: { type: "string", description: "Meeting type — 'L10' (default, weekly leadership meeting), 'Quarterly', 'Annual', or 'Same_Page'." },
        limit: { type: "number", description: "Max meetings to return, most recent first. Default 8." },
      },
      required: [],
    },
  },
  {
    name: "get_eos_meeting_details",
    description:
      "Full details of one specific Vivacity internal EOS meeting — headlines, issues (with resolution/status), to-dos (with owner and due date), rocks (with status and owner), attendance, personal/professional wins shared, and any VTO/scorecard changes. Omit meeting_id to get the MOST RECENT held meeting of the given type (default 'L10') — use this for 'what happened at the last L10 meeting' style questions, since search_eos is semantic search only and cannot reliably identify 'the most recent' meeting. Pass a meeting_id from list_eos_meetings to get a specific past meeting instead.",
    input_schema: {
      type: "object",
      properties: {
        meeting_id: { type: "string", description: "Optional: a specific meeting's id, from list_eos_meetings. Omit for the most recent held meeting." },
        meeting_type: { type: "string", description: "Only used when meeting_id is omitted — which meeting type to find the latest of. Default 'L10'." },
      },
      required: [],
    },
  },
];

const SYSTEM_PROMPT = `You are Ask Viv Assistant, an internal conversational assistant for Vivacity staff working with Unicorn, the RTO compliance management platform.

You are read-only. You never create, update, delete, approve, or submit anything, and you never draft anything intended to be sent directly to a client.

You have tools to look up real data (clients, facts, notes, documents). Use them whenever a question needs real information you don't already have from earlier in this conversation — never fabricate a client name, fact, date, or figure that a tool didn't actually return. If a tool returns nothing relevant, say so plainly rather than guessing.

When you reference something a tool returned, make it clear what it's based on (e.g. "according to the client record...") so the person you're talking to can tell what's grounded in real data versus your own general knowledge.

When search_standards returns regulatory text (Standards for RTOs, National Code, ESOS Act, practice guides), paraphrase it in your own words rather than reproducing it at length — short quotes (a clause title, a key phrase) are fine, but don't dump long verbatim passages. The retrieved text is a draft aid for you, not the final word — note that the approved policy suite and a Vivacity consultant's advice are the authoritative source for regulatory interpretation.

For questions about a specific EOS meeting's recency ("what happened at the last L10", "what came up in this week's meeting"), use get_eos_meeting_details (omit meeting_id for the most recent held meeting) or list_eos_meetings — these are exact, date-grounded lookups. Only use search_eos (semantic search) for topic-based questions across meeting history ("has X ever come up in a meeting") — it cannot reliably tell you which meeting was most recent.

For "are there new clients" / "who's onboarded recently" style questions, use list_new_clients — it is date-grounded on the client's actual onboarding date, not an activity proxy. Do not use rank_clients_by_activity for this: it ranks by how busy a client has been, which surfaces long-standing clients going through a busy period just as readily as a genuinely new one. Once list_new_clients identifies a client, offer (or go ahead and pull, if the user's phrasing suggests they want it) that client's comprehensive details via get_client_context — package/phase status, tasks, documents, portal users, and recent notes/activity — rather than stopping at the bare list.

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

// Activity-count source tables shared by rank_clients_by_activity,
// get_activity_trend, and search_notes_across_clients' csc scoping — kept
// in one place so the three tools can't quietly disagree about which
// column each metric counts against.
const ACTIVITY_METRIC_CONFIG: Record<string, { table: string; dateColumn: string; valueColumn: string | null }> = {
  notes: { table: "notes", dateColumn: "created_at", valueColumn: null },
  timeline_events: { table: "client_timeline_events", dateColumn: "occurred_at", valueColumn: null },
  time_logged: { table: "time_entries", dateColumn: "start_at", valueColumn: "duration_minutes" },
};

interface StaffResolution {
  ambiguous: boolean;
  staffName?: string;
  tenantIds: number[];
  candidates?: Array<{ user_id: string; name: string; email: string }>;
}

/**
 * Resolve a staff name to their actively-assigned client tenant_ids via
 * tenant_csc_assignments — the authoritative CSC-assignment table (not
 * tenants.assigned_consultant_user_id, a second, usually-but-not-always
 * agreeing source). Shared by every tool that accepts an optional
 * csc_name scope, so they all resolve staff names identically to
 * list_clients_for_staff.
 */
async function resolveStaffNameToTenantIds(supabase: any, staffName: string): Promise<StaffResolution> {
  const words = staffName.split(/\s+/).filter(Boolean);
  const orConditions = words.flatMap((w) => [`first_name.ilike.%${w}%`, `last_name.ilike.%${w}%`, `email.ilike.%${w}%`]).join(",");

  const { data: candidates, error } = await supabase
    .from("users")
    .select("user_uuid, first_name, last_name, email")
    .eq("is_vivacity_internal", true)
    .eq("disabled", false)
    .eq("archived", false)
    .or(orConditions)
    .limit(25);
  if (error) throw new Error(error.message);

  const allCandidates = candidates || [];
  const fullMatches = allCandidates.filter((u: any) => {
    const haystack = `${u.first_name ?? ""} ${u.last_name ?? ""} ${u.email ?? ""}`.toLowerCase();
    return words.every((w) => haystack.includes(w.toLowerCase()));
  });
  const matched = (fullMatches.length > 0 ? fullMatches : allCandidates).slice(0, 10);

  if (matched.length !== 1) {
    return {
      ambiguous: true,
      tenantIds: [],
      candidates: matched.map((u: any) => ({ user_id: u.user_uuid, name: `${u.first_name} ${u.last_name}`, email: u.email })),
    };
  }

  const staffMember = matched[0];
  const { data: assignments, error: assignErr } = await supabase
    .from("tenant_csc_assignments")
    .select("tenant_id")
    .eq("csc_user_id", staffMember.user_uuid)
    .eq("is_primary", true)
    .is("ended_at", null);
  if (assignErr) throw new Error(assignErr.message);

  return {
    ambiguous: false,
    staffName: `${staffMember.first_name} ${staffMember.last_name}`,
    tenantIds: (assignments || []).map((a: any) => a.tenant_id),
  };
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

  if (name === "get_portfolio_attention") {
    try {
      const portfolio = await buildPortfolioFacts(supabase, profile.user_uuid);
      return {
        result: { facts_summary: formatFactsForLLM(portfolio.facts), gaps: portfolio.gaps },
        summary: `get_portfolio_attention() — ${portfolio.tenant_ids_touched.length} client(s) covered`,
      };
    } catch (err) {
      return { result: { error: err instanceof Error ? err.message : String(err) }, summary: "get_portfolio_attention failed" };
    }
  }

  if (name === "rank_clients_by_activity") {
    const metric = String(input.metric ?? "");
    const config = ACTIVITY_METRIC_CONFIG[metric];
    if (!config) {
      return { result: { error: "metric must be one of: notes, timeline_events, time_logged" }, summary: "rank_clients_by_activity called with invalid metric" };
    }
    const windowDays = Number(input.window_days) > 0 ? Number(input.window_days) : 30;
    const direction = input.direction === "least" ? "least" : "most";
    const limit = Math.min(Math.max(Number(input.limit) || 10, 1), 25);
    const cutoff = new Date(Date.now() - windowDays * 86400000).toISOString();

    try {
      const { data: activeTenants, error: tenantsErr } = await supabase
        .from("tenants")
        .select("id, name")
        .eq("status", "active")
        .eq("is_system_tenant", false);
      if (tenantsErr) throw new Error(tenantsErr.message);
      const tenantNameById = new Map<number, string>((activeTenants || []).map((t: any) => [t.id, t.name]));

      const selectCols = config.valueColumn ? `tenant_id, ${config.valueColumn}` : "tenant_id";
      const { data: rows, error: rowsErr } = await supabase
        .from(config.table)
        .select(selectCols)
        .gte(config.dateColumn, cutoff)
        .not("tenant_id", "is", null)
        .limit(10000);
      if (rowsErr) throw new Error(rowsErr.message);

      const totals = new Map<number, number>();
      for (const row of (rows || []) as any[]) {
        if (!tenantNameById.has(row.tenant_id)) continue; // inactive/system tenant — excluded from the ranked set entirely
        const inc = config.valueColumn ? (row[config.valueColumn] ?? 0) / 60 : 1;
        totals.set(row.tenant_id, (totals.get(row.tenant_id) ?? 0) + inc);
      }

      const ranked = [...tenantNameById.entries()].map(([tenantId, tenantName]) => ({
        tenant_id: tenantId,
        name: tenantName,
        count: metric === "time_logged" ? Math.round((totals.get(tenantId) ?? 0) * 10) / 10 : totals.get(tenantId) ?? 0,
      }));
      ranked.sort((a, b) => (direction === "most" ? b.count - a.count : a.count - b.count));
      const top = ranked.slice(0, limit);
      const unit = metric === "time_logged" ? "hours logged" : metric === "timeline_events" ? "timeline events" : "notes";

      return {
        result: { metric, window_days: windowDays, direction, unit, ranked: top },
        summary: `rank_clients_by_activity(${metric}, ${windowDays}d, ${direction}) — top ${top.length} of ${ranked.length} active client(s)`,
      };
    } catch (err) {
      return { result: { error: err instanceof Error ? err.message : String(err) }, summary: "rank_clients_by_activity failed" };
    }
  }

  if (name === "list_new_clients") {
    const windowDays = Number(input.window_days) > 0 ? Number(input.window_days) : 30;
    const limit = Math.min(Math.max(Number(input.limit) || 15, 1), 50);
    // Any effective-date day shared by more than this many tenants is treated
    // as a historical bulk import batch, not real same-day signings — the
    // legacy migration alone landed 375 tenants on one day, and a second
    // CSV import added 21 more on another; both would otherwise swamp a
    // "new clients" answer.
    const BULK_IMPORT_DAY_THRESHOLD = 5;
    const cutoff = new Date(Date.now() - windowDays * 86400000).toISOString();

    try {
      const { data: rows, error } = await supabase
        .from("tenants")
        .select("id, name, status, lifecycle_status, risk_level, package_id, client_onboarded_at, created_at")
        .eq("is_system_tenant", false)
        .is("archived_at", null)
        .or(`created_at.gte.${cutoff},client_onboarded_at.gte.${cutoff}`)
        .limit(500);
      if (error) throw new Error(error.message);

      const withEffectiveDate = (rows || [])
        .map((t: any) => ({ ...t, effective_date: t.client_onboarded_at || t.created_at, source: t.client_onboarded_at ? "client_onboarded_at" : "created_at" }))
        .filter((t: any) => t.effective_date >= cutoff);

      const dayCounts = new Map<string, number>();
      for (const t of withEffectiveDate) {
        const day = t.effective_date.slice(0, 10);
        dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
      }
      const bulkImportDays = [...dayCounts.entries()].filter(([, count]) => count > BULK_IMPORT_DAY_THRESHOLD);
      const bulkDaySet = new Set(bulkImportDays.map(([day]) => day));

      const genuinelyNew = withEffectiveDate
        .filter((t: any) => !bulkDaySet.has(t.effective_date.slice(0, 10)))
        .sort((a: any, b: any) => (a.effective_date < b.effective_date ? 1 : -1))
        .slice(0, limit);

      const tenantIds = genuinelyNew.map((t: any) => t.id);
      const packageIds = [...new Set(genuinelyNew.map((t: any) => t.package_id).filter((p: any) => p != null))];

      const packageNameById = new Map<number, string>();
      if (packageIds.length > 0) {
        const { data: packageRows } = await supabase.from("packages").select("id, name").in("id", packageIds);
        for (const p of packageRows || []) packageNameById.set(p.id, p.name);
      }

      const cscNameByTenant = new Map<number, string>();
      if (tenantIds.length > 0) {
        const { data: assignments } = await supabase
          .from("tenant_csc_assignments")
          .select("tenant_id, csc_user_id")
          .in("tenant_id", tenantIds)
          .eq("is_primary", true)
          .is("ended_at", null);
        const cscUserIds = [...new Set((assignments || []).map((a: any) => a.csc_user_id))];
        const cscNameByUserId = new Map<string, string>();
        if (cscUserIds.length > 0) {
          const { data: cscUsers } = await supabase.from("users").select("user_uuid, first_name, last_name").in("user_uuid", cscUserIds);
          for (const u of cscUsers || []) cscNameByUserId.set(u.user_uuid, `${u.first_name} ${u.last_name}`);
        }
        for (const a of assignments || []) {
          const name = cscNameByUserId.get(a.csc_user_id);
          if (name) cscNameByTenant.set(a.tenant_id, name);
        }
      }

      const newClients = genuinelyNew.map((t: any) => ({
        tenant_id: t.id,
        name: t.name,
        status: t.status,
        lifecycle_status: t.lifecycle_status,
        risk_level: t.risk_level,
        onboarded_at: t.effective_date,
        onboarded_at_source: t.source,
        package: t.package_id != null ? packageNameById.get(t.package_id) ?? null : null,
        csc_name: cscNameByTenant.get(t.id) ?? null,
      }));

      return {
        result: {
          window_days: windowDays,
          new_clients: newClients,
          excluded_bulk_import_days: bulkImportDays.map(([day, count]) => ({ day, tenants_excluded: count })),
          note: "Call get_client_context with a tenant_id for a specific new client's full comprehensive snapshot.",
        },
        summary:
          `list_new_clients(${windowDays}d) — ${newClients.length} new client(s)` +
          (bulkImportDays.length > 0 ? `, excluded ${bulkImportDays.length} bulk-import day(s)` : ""),
      };
    } catch (err) {
      return { result: { error: err instanceof Error ? err.message : String(err) }, summary: "list_new_clients failed" };
    }
  }

  if (name === "list_deadlines_and_overdue_work") {
    const cscName = typeof input.csc_name === "string" ? input.csc_name.trim() : "";
    const windowDays = Number(input.window_days) > 0 ? Number(input.window_days) : 90;

    try {
      let scopeTenantIds: number[] | null = null;
      if (cscName) {
        const resolved = await resolveStaffNameToTenantIds(supabase, cscName);
        if (resolved.ambiguous) {
          return { result: { staff_matches: resolved.candidates }, summary: `list_deadlines_and_overdue_work("${cscName}") — ambiguous staff name` };
        }
        scopeTenantIds = resolved.tenantIds;
        if (scopeTenantIds.length === 0) {
          return { result: { overdue_action_items: [], overdue_audits: [], upcoming_audit_deadlines: [], registrations_expiring_soon: [] }, summary: `list_deadlines_and_overdue_work("${cscName}") — no clients assigned` };
        }
      }

      const today = new Date().toISOString().slice(0, 10);
      const windowEnd = new Date(Date.now() + windowDays * 86400000).toISOString().slice(0, 10);

      let actionItemsQuery = supabase
        .from("client_action_items")
        .select("id, tenant_id, title, due_date, priority, item_type")
        .is("completed_at", null)
        .not("due_date", "is", null)
        .lt("due_date", today)
        .order("due_date", { ascending: true })
        .limit(100);
      if (scopeTenantIds) actionItemsQuery = actionItemsQuery.in("tenant_id", scopeTenantIds);
      const { data: overdueItems, error: itemsErr } = await actionItemsQuery;
      if (itemsErr) throw new Error(itemsErr.message);

      // Queried separately from registration expiry below — next_due_date is
      // null for the ~96% of clients never yet audited, so a single query
      // filtered on next_due_date would silently drop their registration
      // expiry from view entirely.
      let auditDueQuery = supabase
        .from("v_audit_schedule")
        .select("tenant_id, client_name, next_due_date, days_until_due")
        .not("next_due_date", "is", null)
        .lte("next_due_date", windowEnd)
        .order("next_due_date", { ascending: true })
        .limit(100);
      if (scopeTenantIds) auditDueQuery = auditDueQuery.in("tenant_id", scopeTenantIds);
      const { data: auditDueRows, error: auditDueErr } = await auditDueQuery;
      if (auditDueErr) throw new Error(auditDueErr.message);

      let registrationQuery = supabase
        .from("v_audit_schedule")
        .select("tenant_id, client_name, registration_end_date")
        .not("registration_end_date", "is", null)
        .gte("registration_end_date", today)
        .lte("registration_end_date", windowEnd)
        .order("registration_end_date", { ascending: true })
        .limit(100);
      if (scopeTenantIds) registrationQuery = registrationQuery.in("tenant_id", scopeTenantIds);
      const { data: registrationRows, error: regErr } = await registrationQuery;
      if (regErr) throw new Error(regErr.message);

      const tenantIds = [...new Set((overdueItems || []).map((i: any) => i.tenant_id))];
      const tenantNameById = new Map<number, string>();
      if (tenantIds.length > 0) {
        const { data: tenantRows } = await supabase.from("tenants").select("id, name").in("id", tenantIds);
        for (const t of tenantRows || []) tenantNameById.set(t.id, t.name);
      }

      const overdueActionItems = (overdueItems || []).map((i: any) => ({
        tenant_id: i.tenant_id,
        client_name: tenantNameById.get(i.tenant_id) ?? null,
        title: i.title,
        due_date: i.due_date,
        priority: i.priority,
        item_type: i.item_type,
      }));
      const overdueAudits = (auditDueRows || []).filter((r: any) => r.next_due_date < today);
      const upcomingAuditDeadlines = (auditDueRows || []).filter((r: any) => r.next_due_date >= today);

      return {
        result: {
          window_days: windowDays,
          overdue_action_items: overdueActionItems,
          overdue_audits: overdueAudits.map((r: any) => ({ tenant_id: r.tenant_id, client_name: r.client_name, next_due_date: r.next_due_date, days_overdue: -r.days_until_due })),
          upcoming_audit_deadlines: upcomingAuditDeadlines.map((r: any) => ({ tenant_id: r.tenant_id, client_name: r.client_name, next_due_date: r.next_due_date, days_until_due: r.days_until_due })),
          registrations_expiring_soon: (registrationRows || []).map((r: any) => ({ tenant_id: r.tenant_id, client_name: r.client_name, registration_end_date: r.registration_end_date })),
        },
        summary:
          `list_deadlines_and_overdue_work(${cscName || "platform-wide"}) — ${overdueActionItems.length} overdue action item(s), ` +
          `${overdueAudits.length} overdue audit(s), ${upcomingAuditDeadlines.length} upcoming audit deadline(s), ` +
          `${(registrationRows || []).length} registration(s) expiring soon`,
      };
    } catch (err) {
      return { result: { error: err instanceof Error ? err.message : String(err) }, summary: "list_deadlines_and_overdue_work failed" };
    }
  }

  if (name === "find_findings_without_remediation") {
    const tenantId = input.tenant_id !== undefined && input.tenant_id !== null ? Number(input.tenant_id) : null;
    try {
      const { data: findings, error } = await supabase
        .from("v_client_audit_findings_without_actions")
        .select("finding_id, audit_id, finding_code, summary, priority, section_title")
        .limit(100);
      if (error) throw new Error(error.message);

      const auditIds = [...new Set((findings || []).map((f: any) => f.audit_id))];
      const auditTenantById = new Map<string, number>();
      if (auditIds.length > 0) {
        const { data: audits } = await supabase.from("client_audits").select("id, subject_tenant_id").in("id", auditIds);
        for (const a of audits || []) auditTenantById.set(a.id, a.subject_tenant_id);
      }
      const relevantTenantIds = [...new Set([...auditTenantById.values()])];
      const tenantNameById = new Map<number, string>();
      if (relevantTenantIds.length > 0) {
        const { data: tenantRows } = await supabase.from("tenants").select("id, name").in("id", relevantTenantIds);
        for (const t of tenantRows || []) tenantNameById.set(t.id, t.name);
      }

      let enriched = (findings || []).map((f: any) => {
        const ftid = auditTenantById.get(f.audit_id) ?? null;
        return {
          tenant_id: ftid,
          client_name: ftid !== null ? tenantNameById.get(ftid) ?? null : null,
          finding_code: f.finding_code,
          summary: f.summary,
          priority: f.priority,
          section: f.section_title,
        };
      });
      if (tenantId !== null) enriched = enriched.filter((f: any) => f.tenant_id === tenantId);

      return {
        result: { findings: enriched, note: "Only critical/high-priority findings with no remediation action recorded are included — not every finding." },
        summary: `find_findings_without_remediation(${tenantId ?? "platform-wide"}) — ${enriched.length} finding(s)`,
      };
    } catch (err) {
      return { result: { error: err instanceof Error ? err.message : String(err) }, summary: "find_findings_without_remediation failed" };
    }
  }

  if (name === "compare_clients") {
    const tenantIds = Array.isArray(input.tenant_ids)
      ? (input.tenant_ids as any[]).map((t) => Number(t)).filter((t) => !Number.isNaN(t))
      : [];
    if (tenantIds.length < 2) {
      return { result: { error: "tenant_ids must include at least 2 tenant ids" }, summary: "compare_clients called with fewer than 2 tenant_ids" };
    }
    try {
      const { data: attentionRows, error: attErr } = await supabase
        .from("v_dashboard_attention_ranked")
        .select("tenant_id, tenant_name, attention_score, attention_drivers_json, overdue_tasks_count, days_since_activity, burn_risk_status, days_to_renewal, risk_status")
        .in("tenant_id", tenantIds);
      if (attErr) throw new Error(attErr.message);

      const { data: auditRows, error: auditErr } = await supabase
        .from("v_audit_schedule")
        .select("tenant_id, schedule_status, next_due_date, days_until_due")
        .in("tenant_id", tenantIds);
      if (auditErr) throw new Error(auditErr.message);
      const auditByTenant = new Map<number, any>((auditRows || []).map((r: any) => [r.tenant_id, r]));

      const comparison = (attentionRows || []).map((r: any) => ({
        tenant_id: r.tenant_id,
        name: r.tenant_name,
        attention_score: r.attention_score,
        top_driver: r.attention_drivers_json?.[0]?.driver ?? null,
        overdue_tasks_count: r.overdue_tasks_count,
        days_since_activity: r.days_since_activity,
        burn_risk_status: r.burn_risk_status,
        days_to_renewal: r.days_to_renewal,
        risk_status: r.risk_status,
        audit_schedule_status: auditByTenant.get(r.tenant_id)?.schedule_status ?? null,
        next_audit_due: auditByTenant.get(r.tenant_id)?.next_due_date ?? null,
      }));

      return {
        result: { comparison },
        summary: `compare_clients(${tenantIds.join(", ")}) — compared ${comparison.length} of ${tenantIds.length} requested client(s)`,
      };
    } catch (err) {
      return { result: { error: err instanceof Error ? err.message : String(err) }, summary: "compare_clients failed" };
    }
  }

  if (name === "get_stage_health_hotspots") {
    const cscName = typeof input.csc_name === "string" ? input.csc_name.trim() : "";
    const limit = Math.min(Math.max(Number(input.limit) || 10, 1), 25);
    try {
      let scopeTenantIds: number[] | null = null;
      if (cscName) {
        const resolved = await resolveStaffNameToTenantIds(supabase, cscName);
        if (resolved.ambiguous) {
          return { result: { staff_matches: resolved.candidates }, summary: `get_stage_health_hotspots("${cscName}") — ambiguous staff name` };
        }
        scopeTenantIds = resolved.tenantIds;
        if (scopeTenantIds.length === 0) {
          return { result: { hotspots: [] }, summary: `get_stage_health_hotspots("${cscName}") — no clients assigned` };
        }
      }

      let query = supabase
        .from("v_stage_health_latest")
        .select("tenant_id, health_status")
        .in("health_status", ["critical", "monitoring"])
        .limit(10000);
      if (scopeTenantIds) query = query.in("tenant_id", scopeTenantIds);
      const { data: rows, error } = await query;
      if (error) throw new Error(error.message);

      const counts = new Map<number, { critical: number; monitoring: number }>();
      for (const row of (rows || []) as any[]) {
        const entry = counts.get(row.tenant_id) ?? { critical: 0, monitoring: 0 };
        if (row.health_status === "critical") entry.critical++;
        else entry.monitoring++;
        counts.set(row.tenant_id, entry);
      }

      const tenantIds = [...counts.keys()];
      const tenantNameById = new Map<number, string>();
      if (tenantIds.length > 0) {
        const { data: tenantRows } = await supabase.from("tenants").select("id, name").in("id", tenantIds);
        for (const t of tenantRows || []) tenantNameById.set(t.id, t.name);
      }

      const hotspots = tenantIds
        .map((tid) => ({
          tenant_id: tid,
          name: tenantNameById.get(tid) ?? null,
          critical_stages: counts.get(tid)!.critical,
          monitoring_stages: counts.get(tid)!.monitoring,
        }))
        .sort((a, b) => b.critical_stages - a.critical_stages || b.monitoring_stages - a.monitoring_stages)
        .slice(0, limit);

      return {
        result: { hotspots },
        summary: `get_stage_health_hotspots(${cscName || "platform-wide"}) — top ${hotspots.length} of ${tenantIds.length} client(s) with at-risk stages`,
      };
    } catch (err) {
      return { result: { error: err instanceof Error ? err.message : String(err) }, summary: "get_stage_health_hotspots failed" };
    }
  }

  if (name === "get_consultant_workload_comparison") {
    try {
      const { data: loadRows, error } = await supabase
        .from("vw_consultant_load")
        .select("user_uuid, weekly_assignable_hours, current_load, remaining_capacity, active_clients_count");
      if (error) throw new Error(error.message);

      // vw_consultant_load can have more than one row per user_uuid (one per
      // internal tenant-membership row) — dedupe to the first, since the
      // computed load/capacity figures are identical across duplicates.
      const byUser = new Map<string, any>();
      for (const row of (loadRows || []) as any[]) {
        if (!byUser.has(row.user_uuid)) byUser.set(row.user_uuid, row);
      }
      const userIds = [...byUser.keys()];
      const { data: users } = userIds.length > 0
        ? await supabase.from("users").select("user_uuid, first_name, last_name").in("user_uuid", userIds)
        : { data: [] as any[] };
      const nameById = new Map<string, string>((users || []).map((u: any) => [u.user_uuid, `${u.first_name} ${u.last_name}`]));

      const workload = [...byUser.values()]
        .map((r: any) => ({
          name: nameById.get(r.user_uuid) ?? null,
          weekly_assignable_hours: r.weekly_assignable_hours,
          current_load_hours: r.current_load,
          remaining_capacity_hours: r.remaining_capacity,
          active_clients_count: r.active_clients_count,
        }))
        .sort((a, b) => (a.remaining_capacity_hours ?? 0) - (b.remaining_capacity_hours ?? 0));

      return {
        result: { workload },
        summary: `get_consultant_workload_comparison() — ${workload.length} consultant(s)`,
      };
    } catch (err) {
      return { result: { error: err instanceof Error ? err.message : String(err) }, summary: "get_consultant_workload_comparison failed" };
    }
  }

  if (name === "get_activity_trend") {
    const metric = String(input.metric ?? "");
    const config = ACTIVITY_METRIC_CONFIG[metric];
    if (!config) {
      return { result: { error: "metric must be one of: notes, timeline_events, time_logged" }, summary: "get_activity_trend called with invalid metric" };
    }
    const periods = Math.min(Math.max(Number(input.periods) || 3, 2), 12);
    const periodDays = Number(input.period_days) > 0 ? Number(input.period_days) : 30;
    const tenantId = input.tenant_id !== undefined && input.tenant_id !== null ? Number(input.tenant_id) : null;

    try {
      const now = Date.now();
      const earliestCutoff = new Date(now - periods * periodDays * 86400000).toISOString();
      const selectCols = config.valueColumn ? `tenant_id, ${config.dateColumn}, ${config.valueColumn}` : `tenant_id, ${config.dateColumn}`;

      let query = supabase.from(config.table).select(selectCols).gte(config.dateColumn, earliestCutoff).limit(20000);
      if (tenantId !== null) query = query.eq("tenant_id", tenantId);
      const { data: rows, error } = await query;
      if (error) throw new Error(error.message);

      const periodTotals: number[] = new Array(periods).fill(0);
      for (const row of (rows || []) as any[]) {
        const ts = new Date(row[config.dateColumn]).getTime();
        const ageDays = (now - ts) / 86400000;
        const periodIndex = Math.floor(ageDays / periodDays);
        if (periodIndex < 0 || periodIndex >= periods) continue;
        const inc = config.valueColumn ? (row[config.valueColumn] ?? 0) / 60 : 1;
        periodTotals[periodIndex] += inc;
      }

      // periodTotals[0] is the most recent period — reverse so the returned
      // array reads chronologically (oldest first), matching how a person
      // would describe a trend.
      const chronological = periodTotals
        .map((count, i) => ({
          period_label: i === 0 ? "most recent" : `${i} period(s) before that`,
          count: metric === "time_logged" ? Math.round(count * 10) / 10 : count,
        }))
        .reverse();

      const unit = metric === "time_logged" ? "hours logged" : metric === "timeline_events" ? "timeline events" : "notes";
      return {
        result: { metric, unit, period_days: periodDays, periods_oldest_first: chronological },
        summary: `get_activity_trend(${metric}, ${tenantId ?? "platform-wide"}, ${periods}x${periodDays}d) — trend computed`,
      };
    } catch (err) {
      return { result: { error: err instanceof Error ? err.message : String(err) }, summary: "get_activity_trend failed" };
    }
  }

  if (name === "search_notes_across_clients") {
    const query = String(input.query ?? "").trim();
    const cscName = typeof input.csc_name === "string" ? input.csc_name.trim() : "";
    const limit = Math.min(Math.max(Number(input.limit) || 10, 1), 20);
    if (!query) {
      return { result: { error: "query is required" }, summary: "search_notes_across_clients called with no query" };
    }
    try {
      let scopeTenantIds: number[] | null = null;
      if (cscName) {
        const resolved = await resolveStaffNameToTenantIds(supabase, cscName);
        if (resolved.ambiguous) {
          return { result: { staff_matches: resolved.candidates }, summary: `search_notes_across_clients("${cscName}") — ambiguous staff name` };
        }
        scopeTenantIds = resolved.tenantIds;
        if (scopeTenantIds.length === 0) {
          return { result: { matches: [] }, summary: `search_notes_across_clients("${cscName}") — no clients assigned` };
        }
      }

      const embedding = await generateEmbedding(query);
      const { data, error } = await supabase.rpc("match_ask_viv_corpus", {
        query_embedding: embedding,
        match_threshold: 0.3,
        match_count: 40,
        filter_tenant_id: null,
        filter_source_type: null,
      });
      if (error) throw new Error(error.message);

      let matches = (data || []).filter((r: any) => r.source_type === "note" || r.source_type === "email");
      if (scopeTenantIds) matches = matches.filter((r: any) => r.tenant_id != null && scopeTenantIds!.includes(r.tenant_id));
      matches = matches.slice(0, limit);

      const tenantIds = [...new Set(matches.map((m: any) => m.tenant_id).filter((t: any) => t != null))];
      const tenantNameById = new Map<number, string>();
      if (tenantIds.length > 0) {
        const { data: tenantRows } = await supabase.from("tenants").select("id, name").in("id", tenantIds);
        for (const t of tenantRows || []) tenantNameById.set(t.id, t.name);
      }

      return {
        result: {
          matches: matches.map((m: any) => ({
            tenant_id: m.tenant_id,
            client_name: m.tenant_id != null ? tenantNameById.get(m.tenant_id) ?? null : null,
            source_type: m.source_type,
            heading: m.heading,
            content: m.content,
            similarity: m.similarity,
          })),
        },
        summary:
          matches.length === 0
            ? `search_notes_across_clients("${query}") — no matches`
            : `search_notes_across_clients("${query}") — ${matches.length} match(es)`,
      };
    } catch (err) {
      return { result: { error: err instanceof Error ? err.message : String(err) }, summary: `search_notes_across_clients("${query}") failed` };
    }
  }

  if (name === "get_academy_adoption") {
    const tenantId = input.tenant_id !== undefined && input.tenant_id !== null ? Number(input.tenant_id) : null;
    try {
      let query = supabase
        .from("v_tenant_academy_summary")
        .select("tenant_id, tenant_name, academy_access_enabled, enrolled_users, courses_enrolled, certificates_issued")
        .order("enrolled_users", { ascending: false })
        .limit(100);
      if (tenantId !== null) query = query.eq("tenant_id", tenantId);
      const { data, error } = await query;
      if (error) throw new Error(error.message);

      const rows = data || [];
      const adopted = rows.filter((r: any) => (r.enrolled_users ?? 0) > 0);
      const shown = tenantId !== null ? rows : adopted;

      return {
        result: {
          portfolio_summary: { total_clients_checked: rows.length, clients_with_enrolled_users: adopted.length },
          clients: shown.map((r: any) => ({
            tenant_id: r.tenant_id,
            name: r.tenant_name,
            academy_access_enabled: r.academy_access_enabled,
            enrolled_users: r.enrolled_users,
            courses_enrolled: r.courses_enrolled,
            certificates_issued: r.certificates_issued,
          })),
        },
        summary: `get_academy_adoption(${tenantId ?? "platform-wide"}) — ${adopted.length} of ${rows.length} client(s) have enrolled users`,
      };
    } catch (err) {
      return { result: { error: err instanceof Error ? err.message : String(err) }, summary: "get_academy_adoption failed" };
    }
  }

  if (name === "list_document_templates") {
    const query = typeof input.query === "string" ? input.query.trim() : "";
    const category = typeof input.category === "string" ? input.category.trim() : "";
    try {
      let dbQuery = supabase
        .from("documents")
        .select("id, title, description, category, document_status, framework_type, format, is_core, standard_set")
        .order("title", { ascending: true })
        .limit(50);
      if (query) dbQuery = dbQuery.or(`title.ilike.%${query}%,description.ilike.%${query}%`);
      if (category) dbQuery = dbQuery.eq("category", category);
      const { data, error } = await dbQuery;
      if (error) throw new Error(error.message);

      const templates = (data || []).map((d: any) => ({
        id: d.id,
        title: d.title,
        description: d.description,
        category: d.category,
        status: d.document_status,
        framework: d.framework_type,
        format: d.format,
        is_core: d.is_core,
        standard_set: d.standard_set,
      }));

      const label = query || category || "all";
      return {
        result: { templates },
        summary: templates.length === 0 ? `list_document_templates(${label}) — no matches` : `list_document_templates(${label}) — ${templates.length} template(s)`,
      };
    } catch (err) {
      return { result: { error: err instanceof Error ? err.message : String(err) }, summary: "list_document_templates failed" };
    }
  }

  if (name === "list_eos_meetings") {
    const meetingType = typeof input.meeting_type === "string" && input.meeting_type.trim() ? input.meeting_type.trim() : "L10";
    const limit = Math.min(Math.max(Number(input.limit) || 8, 1), 25);
    try {
      // No .order()/.limit() on the SQL side here — PostgREST's order-on-
      // embedded-resource syntax (order by eos_meetings.scheduled_date via
      // { foreignTable: "eos_meetings" }) silently no-ops on this
      // supabase-js version instead of erroring, returning arbitrary row
      // order (confirmed live: it returned the OLDEST L10 meeting as
      // "most recent"). Only ~24 L10 rows exist total, so fetching all
      // matches and sorting/slicing here in JS is cheap and deterministic.
      const { data, error } = await supabase
        .from("eos_meeting_summaries")
        .select("id, meeting_id, rating, headlines, issues, rocks, eos_meetings!inner(scheduled_date, title, status, meeting_type)")
        .eq("eos_meetings.meeting_type", meetingType)
        .limit(500);
      if (error) throw new Error(error.message);

      const meetings = (data || [])
        .map((row: any) => {
          const issues = Array.isArray(row.issues) ? row.issues : [];
          const rocks = Array.isArray(row.rocks) ? row.rocks : [];
          const headlines = Array.isArray(row.headlines) ? row.headlines : [];
          return {
            meeting_id: row.meeting_id,
            title: row.eos_meetings?.title ?? null,
            scheduled_date: row.eos_meetings?.scheduled_date ?? null,
            rating: row.rating,
            headline_count: headlines.length,
            issues_solved: issues.filter((i: any) => i.status === "Solved").length,
            issues_open: issues.filter((i: any) => i.status !== "Solved").length,
            rocks_on_track: rocks.filter((r: any) => r.status === "on_track").length,
            rocks_off_track: rocks.filter((r: any) => r.status && r.status !== "on_track").length,
          };
        })
        .sort((a, b) => new Date(b.scheduled_date ?? 0).getTime() - new Date(a.scheduled_date ?? 0).getTime())
        .slice(0, limit);

      return {
        result: { meeting_type: meetingType, meetings },
        summary:
          meetings.length === 0
            ? `list_eos_meetings(${meetingType}) — no held meetings found`
            : `list_eos_meetings(${meetingType}) — ${meetings.length} meeting(s), most recent ${meetings[0]?.scheduled_date}`,
      };
    } catch (err) {
      return { result: { error: err instanceof Error ? err.message : String(err) }, summary: "list_eos_meetings failed" };
    }
  }

  if (name === "get_eos_meeting_details") {
    const meetingType = typeof input.meeting_type === "string" && input.meeting_type.trim() ? input.meeting_type.trim() : "L10";
    const meetingId = typeof input.meeting_id === "string" && input.meeting_id.trim() ? input.meeting_id.trim() : null;
    try {
      let query = supabase
        .from("eos_meeting_summaries")
        .select(
          "id, meeting_id, rating, headlines, issues, todos, rocks, cascades, attendance, segue_shares, vto_changes, chart_changes, eos_meetings!inner(scheduled_date, title, status, meeting_type)"
        );
      if (meetingId) {
        query = query.eq("meeting_id", meetingId);
      } else {
        // Same order-on-embedded-resource caveat as list_eos_meetings — sort
        // in JS below rather than relying on a silently-no-op'd .order().
        query = query.eq("eos_meetings.meeting_type", meetingType).limit(500);
      }
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      const rows = (data || []) as any[];
      const row = meetingId
        ? rows[0]
        : rows.sort(
            (a, b) => new Date(b.eos_meetings?.scheduled_date ?? 0).getTime() - new Date(a.eos_meetings?.scheduled_date ?? 0).getTime()
          )[0];
      if (!row) {
        return {
          result: { error: "No matching EOS meeting found" },
          summary: meetingId ? `get_eos_meeting_details(${meetingId}) — not found` : `get_eos_meeting_details(latest ${meetingType}) — none held yet`,
        };
      }

      const todos = Array.isArray(row.todos) ? row.todos : [];
      const rocks = Array.isArray(row.rocks) ? row.rocks : [];
      const attendance = Array.isArray(row.attendance) ? row.attendance : [];
      const segueShares = Array.isArray(row.segue_shares) ? row.segue_shares : [];
      const headlines = Array.isArray(row.headlines) ? row.headlines : [];
      const issues = Array.isArray(row.issues) ? row.issues : [];
      const cascades = Array.isArray(row.cascades) ? row.cascades : [];

      // Resolve every owner_id/user_id reference across todos/rocks/attendance/
      // segue_shares/headlines to a real name in one batch lookup, same pattern
      // as get_consultant_workload_comparison.
      const userIds = new Set<string>();
      for (const t of todos) if (t.owner_id) userIds.add(t.owner_id);
      for (const r of rocks) if (r.owner_id) userIds.add(r.owner_id);
      for (const a of attendance) if (a.user_id) userIds.add(a.user_id);
      for (const s of segueShares) if (s.user_id) userIds.add(s.user_id);
      for (const h of headlines) if (h.user_id) userIds.add(h.user_id);

      const { data: users } = userIds.size > 0
        ? await supabase.from("users").select("user_uuid, first_name, last_name").in("user_uuid", [...userIds])
        : { data: [] as any[] };
      const nameById = new Map<string, string>((users || []).map((u: any) => [u.user_uuid, `${u.first_name} ${u.last_name}`]));
      const nameOf = (id: string | null | undefined) => (id ? nameById.get(id) ?? "Unknown staff" : null);

      const details = {
        title: row.eos_meetings?.title ?? null,
        scheduled_date: row.eos_meetings?.scheduled_date ?? null,
        status: row.eos_meetings?.status ?? null,
        rating: row.rating,
        attendance: attendance.map((a: any) => ({ name: nameOf(a.user_id), attended: a.attended })),
        headlines: headlines.map((h: any) => ({ by: nameOf(h.user_id), headline: h.headline, is_good_news: h.is_good_news })),
        issues: issues.map((i: any) => ({ title: i.title, status: i.status, solution: i.solution, solved_at: i.solved_at })),
        todos: todos.map((t: any) => ({ title: t.title, status: t.status, owner: nameOf(t.owner_id), due_date: t.due_date, completed_at: t.completed_at })),
        rocks: rocks.map((r: any) => ({ title: r.title, status: r.status, owner: nameOf(r.owner_id), rock_level: r.rock_level })),
        personal_professional_wins: segueShares.map((s: any) => ({
          name: nameOf(s.user_id),
          rating: s.rating,
          personal_win: s.personal_win,
          professional_win: s.professional_win,
        })),
        cascading_messages: cascades,
        vto_changes: row.vto_changes ?? [],
        chart_changes: row.chart_changes ?? [],
      };

      return {
        result: details,
        summary: `get_eos_meeting_details(${details.title ?? meetingId ?? "latest " + meetingType}) — ${details.issues.length} issue(s), ${details.todos.length} to-do(s), ${details.rocks.length} rock(s), ${details.personal_professional_wins.length} share(s)`,
      };
    } catch (err) {
      return { result: { error: err instanceof Error ? err.message : String(err) }, summary: "get_eos_meeting_details failed" };
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
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return jsonError(req, 405, "METHOD_NOT_ALLOWED", "Only POST requests are accepted");
  }

  try {
    const token = extractToken(req);
    if (!token) {
      return jsonError(req, 401, "UNAUTHORIZED", "No authorization token provided");
    }

    const supabase = createServiceClient();
    const { user, profile, error: authError } = await verifyAuth(supabase, token);
    if (authError || !user || !profile) {
      return jsonError(req, 401, "UNAUTHORIZED", authError || "Authentication failed");
    }

    const accessCheck = await validateAskVivAccess(supabase, user.id, profile, "ask-viv-assistant");
    if (!accessCheck.allowed) {
      return askVivAccessDeniedResponse(req, accessCheck.reason);
    }

    const enabled = await isAssistantEnabledForUser(supabase, user.id, profile);
    if (!enabled) {
      return jsonError(req, 403, "NOT_ENABLED", "Ask Viv Assistant isn't available for your account yet.");
    }

    let payload: RequestPayload;
    try {
      payload = await req.json();
    } catch {
      return jsonError(req, 400, "BAD_REQUEST", "Invalid JSON body");
    }

    const message = payload.message?.trim();
    if (!message) {
      return jsonError(req, 400, "BAD_REQUEST", "message is required");
    }

    // Best-effort hint of which client the user is currently viewing in the
    // app, resolved client-side from the route. Not a scope/pin — just a name
    // + id the LLM can use to avoid asking "which client?" when the user
    // says "them"/"this client"; it still calls its own tools for real data,
    // and can follow a different client if the user names one.
    let pageContextName: string | null = null;
    const pageTenantId = payload.page_context?.tenant_id;
    if (typeof pageTenantId === "number" && pageTenantId > 0) {
      const { data: pageTenant } = await supabase
        .from("tenants")
        .select("id, name")
        .eq("id", pageTenantId)
        .maybeSingle();
      if (pageTenant) {
        pageContextName = pageTenant.name;
      }
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
      return jsonRaw(req, { content: limitMessage, conversation_id: conversationId, sources_used: [], limited: true });
    }

    // Load + (if needed) refresh the conversation's summarized context before
    // building this turn's prompt, so the bound on raw history is correct.
    const conversationContext = await loadConversationContext(
      supabase,
      conversationId,
      KEEP_RECENT_TURNS * 2 // fetch a bit more than we'll keep, trimmed below
    );
    let { contextSummary, summaryCoversTurns } = conversationContext;
    const { recentTurns } = conversationContext;
    const summarized = await maybeSummarizeConversation(supabase, conversationId, contextSummary, summaryCoversTurns);
    contextSummary = summarized.contextSummary;
    summaryCoversTurns = summarized.summaryCoversTurns;

    let systemText = contextSummary
      ? `${SYSTEM_PROMPT}\n\nEarlier conversation summary:\n${contextSummary}`
      : SYSTEM_PROMPT;
    if (pageContextName) {
      systemText += `\n\nThe user is currently viewing the Client Detail page for ${pageContextName} (tenant_id=${pageTenantId}) in Unicorn. If their message doesn't name a different client, assume they mean this one — but still use your tools (e.g. get_client_context) to pull any real data rather than assuming details. If they ask about a different client, follow that instead.`;
    }

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

    return jsonRaw(req, {
      content: finalText,
      conversation_id: conversationId,
      sources_used: sourcesUsed,
    });
  } catch (err) {
    console.error("Ask Viv Assistant error:", err);
    return jsonError(req, 500, "INTERNAL_ERROR", "An unexpected error occurred");
  }
});
