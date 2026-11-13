/**
 * support-ticket-ai-draft
 *
 * Drafts the classification of a client support message that has ALREADY been
 * saved as a ticket (public.create_support_ticket). The ticket exists with
 * default fields and the client's original wording as message 1 before this
 * runs, so a failure, timeout or refusal here never loses a message.
 *
 * Auth model: client-callable. Same pattern as ask-viv-assistant-client:
 * extractToken + verifyAuth, then an in-function ownership check (the caller
 * must be the ticket's reporter or Vivacity staff). requireCaller's feature
 * keys are staff-only, so they cannot gate a client call. The auth call comes
 * before any other database access.
 *
 * Request: exactly { "ticket_id": "<uuid>" }. Any other key is rejected, so a
 * caller can never supply a tenant, a title or classification values. Ticket,
 * reporter and message text are read here, server-side.
 *
 * Data sent to the model: subject and message text only, masked and capped
 * (draft.ts). No tenant, name, email, URL, diagnostics or images.
 *
 * Writes (service role): title (only when the client gave no subject), type,
 * urgency, ai_state, and one staff-only ai_draft message. Everything the model
 * returns passes runtime allowlists first.
 */
import { createServiceClient } from "../_shared/supabase-client.ts";
import { extractToken, verifyAuth, VIVACITY_STAFF_ROLES } from "../_shared/auth-helpers.ts";
import { handleCors, jsonError, jsonOk } from "../_shared/response-helpers.ts";
import { callAnthropic, CLAUDE_HAIKU_MODEL, extractToolUses } from "../_shared/anthropic-client.ts";
import {
  AI_TIMEOUT_MS,
  DRAFT_TOOL,
  SYSTEM_PROMPT,
  buildAiNote,
  buildUserPrompt,
  defaultTitleFor,
  validateDraft,
  withTimeout,
} from "./draft.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors(req);
  if (req.method !== "POST") return jsonError(req, 405, "METHOD_NOT_ALLOWED", "POST only");

  const token = extractToken(req);
  if (!token) return jsonError(req, 401, "UNAUTHORIZED", "No token provided");

  const supabase = createServiceClient();
  const { user, profile, error: authError } = await verifyAuth(supabase, token);
  if (authError || !user || !profile) {
    return jsonError(req, 401, "UNAUTHORIZED", authError || "Authentication failed");
  }

  // Runtime allowlist: exactly one key, a UUID.
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError(req, 400, "BAD_REQUEST", "Invalid JSON body");
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return jsonError(req, 400, "BAD_REQUEST", "Body must be an object");
  }
  const keys = Object.keys(raw as Record<string, unknown>);
  if (keys.length !== 1 || keys[0] !== "ticket_id") {
    return jsonError(req, 400, "BAD_REQUEST", "Only ticket_id is accepted");
  }
  const ticketId = (raw as Record<string, unknown>).ticket_id;
  if (typeof ticketId !== "string" || !UUID_RE.test(ticketId)) {
    return jsonError(req, 400, "BAD_REQUEST", "ticket_id must be a UUID");
  }

  // Resolve the ticket server-side and check ownership. A non-owner gets the
  // same answer as a missing ticket, so ids cannot be probed.
  const { data: ticket, error: ticketError } = await supabase
    .from("support_tickets")
    .select("id, reporter_id, product, ai_state, title, deleted_at")
    .eq("id", ticketId)
    .maybeSingle();
  if (ticketError) {
    console.error("support-ticket-ai-draft: ticket read failed", ticketError.code);
    return jsonError(req, 500, "INTERNAL_ERROR", "Could not read ticket");
  }
  const isStaff = VIVACITY_STAFF_ROLES.includes(profile.unicorn_role ?? "");
  if (!ticket || ticket.deleted_at || (ticket.reporter_id !== user.id && !isStaff)) {
    return jsonError(req, 404, "NOT_FOUND", "Ticket not found");
  }
  if (ticket.product !== "unicorn") {
    return jsonOk(req, { ai_state: ticket.ai_state, skipped: true });
  }

  // Claim once. Only a ticket still 'pending' is drafted, and only by whoever
  // wins this update, so repeated calls cost nothing and cannot overwrite.
  const { data: claimed, error: claimError } = await supabase
    .from("support_tickets")
    .update({ ai_state: "drafting" })
    .eq("id", ticket.id)
    .eq("ai_state", "pending")
    .select("id")
    .maybeSingle();
  if (claimError) {
    console.error("support-ticket-ai-draft: claim failed", claimError.code);
    return jsonError(req, 500, "INTERNAL_ERROR", "Could not start drafting");
  }
  if (!claimed) return jsonOk(req, { ai_state: ticket.ai_state, skipped: true });

  const fail = async () => {
    await supabase
      .from("support_tickets")
      .update({ ai_state: "failed" })
      .eq("id", ticket.id)
      .eq("ai_state", "drafting");
    return jsonOk(req, { ai_state: "failed" });
  };

  try {
    const { data: first, error: firstError } = await supabase
      .from("support_ticket_messages")
      .select("body")
      .eq("ticket_id", ticket.id)
      .eq("kind", "reply")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (firstError || !first?.body) return await fail();

    // The title equals the default only when the client gave no subject.
    const hasSubject = ticket.title !== defaultTitleFor(first.body);

    const controller = new AbortController();
    const response = await withTimeout(
      callAnthropic({
        model: CLAUDE_HAIKU_MODEL,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserPrompt(hasSubject ? ticket.title : null, first.body) }],
        tools: [DRAFT_TOOL],
        tool_choice: { type: "tool", name: DRAFT_TOOL.name },
        max_tokens: 400,
        temperature: 0,
        signal: controller.signal,
      }),
      AI_TIMEOUT_MS,
    ).catch((e) => {
      controller.abort();
      throw e;
    });

    const toolUse = extractToolUses(response).find((t) => t.name === DRAFT_TOOL.name);
    const draft = validateDraft(toolUse?.input);
    if (!draft) return await fail();

    const patch: Record<string, string> = { ai_state: "drafted" };
    if (draft.title && !hasSubject) patch.title = draft.title;
    if (draft.type) patch.type = draft.type;
    if (draft.urgency) patch.urgency = draft.urgency;

    const { data: updated, error: updateError } = await supabase
      .from("support_tickets")
      .update(patch)
      .eq("id", ticket.id)
      .eq("ai_state", "drafting")
      .select("id")
      .maybeSingle();
    if (updateError || !updated) return await fail();

    await supabase.from("support_ticket_messages").insert({
      ticket_id: ticket.id,
      author_id: null,
      kind: "ai_draft",
      staff_only: true,
      body: buildAiNote(draft),
    });

    return jsonOk(req, { ai_state: "drafted" });
  } catch (e) {
    // Log the failure class only, never the client's text.
    console.error("support-ticket-ai-draft: draft failed", e instanceof Error ? e.name : "unknown");
    return await fail();
  }
});
