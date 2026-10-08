/**
 * preview-teams-event-group
 *
 * Resolves the selected Contact Directory Group's CURRENT membership on the
 * server and reports who would be registered, excluded, skipped as duplicate
 * or skipped as already processed — without writing anything. Returns a
 * short-lived signed preview token binding {user, event, group, membership}
 * that register-teams-webinar-group requires.
 *
 * POST { event_type: "webinar", event_id: string, group_id: number }
 */
import { corsHeadersFor, requireCaller } from "../_shared/requireCaller.ts";
import {
  createAdminClient,
  createGraphFromEnv,
  errorResponse,
  graphErrorResponse,
  jsonResponse,
  notConfiguredResponse,
  parseEventId,
  parsePositiveInt,
  previewSigningSecret,
  teamsEventsCallerOptions,
} from "../_shared/teams-events/server.ts";
import { isUsableWebinar, isWithinWindow, toEventSummary } from "../_shared/teams-events/event-window.ts";
import { resolveGroupForEvent } from "../_shared/teams-events/group-resolution.ts";
import { PREVIEW_TOKEN_TTL_SECONDS, signPreviewToken } from "../_shared/teams-events/preview-token.ts";
import type { ClassifiedMember } from "../_shared/teams-events/membership.ts";

const LIST_CAP = 300;

function displayRow(m: ClassifiedMember) {
  return {
    member_key: `${m.member.memberType}:${m.member.memberId}`,
    source: m.member.memberType,
    tenant_id: m.member.tenantId,
    first_name: m.member.firstName,
    last_name: m.member.lastName,
    email: m.member.email,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });
  if (req.method !== "POST") return errorResponse(req, 405, "method_not_allowed", "Method not allowed");

  const admin = createAdminClient();
  if (!admin) return errorResponse(req, 500, "server_misconfigured", "Server misconfigured");

  const caller = await requireCaller(req, admin, teamsEventsCallerOptions(req));
  if (!caller.ok) return caller.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const eventType = body?.event_type ?? "webinar";
  if (eventType === "meeting") {
    return errorResponse(req, 501, "meetings_not_supported", "Teams Meetings are not available yet. Choose Webinars.");
  }
  const eventId = parseEventId(body?.event_id);
  const groupId = parsePositiveInt(body?.group_id);
  if (eventType !== "webinar" || !eventId || !groupId) {
    return errorResponse(req, 400, "invalid_request", "event_type, event_id and group_id are required");
  }

  const graph = createGraphFromEnv();
  if (!graph.ok) return notConfiguredResponse(req);

  // Re-fetch the event so the preview reflects Teams, not what the browser sent.
  const fetched = await graph.client.getWebinar(eventId);
  if (!fetched.ok) return graphErrorResponse(req, fetched.error);
  const event = toEventSummary({ ...fetched.webinar, id: fetched.webinar.id ?? eventId });
  if (!isUsableWebinar({ ...fetched.webinar, id: eventId }) || !event) {
    return errorResponse(req, 409, "event_unavailable", "This event is not published or is no longer available.");
  }
  if (!isWithinWindow(new Date(event.startUtc), new Date())) {
    return errorResponse(req, 409, "event_out_of_window", "This event is outside the next 14 days.");
  }

  const result = await resolveGroupForEvent(admin, { eventType: "webinar", eventId, groupId });
  if (!result.ok) {
    return result.reason === "not_found"
      ? errorResponse(req, 404, "group_not_found", "That Contact Directory Group no longer exists.")
      : errorResponse(req, 500, "group_resolution_failed", "Could not load the group's members.");
  }
  const { group, classification, fingerprint, memberCount, alreadyProcessed } = result.resolved;

  const eligible = classification.members.filter((m) => m.kind === "eligible");
  const toRegister = eligible.filter((m) => m.kind === "eligible" && !alreadyProcessed.has(m.normalisedEmail));
  const alreadyDone = eligible.filter((m) => m.kind === "eligible" && alreadyProcessed.has(m.normalisedEmail));
  const excluded = classification.members.filter((m) => m.kind === "excluded");
  const duplicates = classification.members.filter((m) => m.kind === "duplicate");

  // Mandatory registration questions: Unicorn never invents answers, so stop
  // before processing. If the check itself fails we warn instead of blocking;
  // Graph would still reject each person and the batch reports it.
  const questions = await graph.client.listRegistrationQuestions(eventId);
  const requiredQuestions = questions.ok ? questions.questions.filter((q) => q.isRequired) : [];
  const questionsCheck = !questions.ok ? "unverified" : requiredQuestions.length > 0 ? "blocked" : "ok";

  const token = await signPreviewToken(
    {
      uid: caller.user.id,
      eventType: "webinar",
      eventId,
      groupId,
      memberCount,
      membershipHash: fingerprint,
      exp: Math.floor(Date.now() / 1000) + PREVIEW_TOKEN_TTL_SECONDS,
    },
    previewSigningSecret(),
  );

  return jsonResponse(req, 200, {
    event,
    group,
    counts: {
      members: memberCount,
      eligible: eligible.length,
      to_register: toRegister.length,
      already_processed: alreadyDone.length,
      excluded: excluded.length,
      duplicate: duplicates.length,
    },
    to_register: toRegister.slice(0, LIST_CAP).map(displayRow),
    already_processed: alreadyDone.slice(0, LIST_CAP).map(displayRow),
    excluded: excluded.slice(0, LIST_CAP).map((m) => ({
      ...displayRow(m),
      reason: m.kind === "excluded" ? m.reason : null,
    })),
    duplicates: duplicates.slice(0, LIST_CAP).map((m) => ({
      ...displayRow(m),
      duplicate_of: m.kind === "duplicate" ? m.duplicateOf : null,
    })),
    list_cap: LIST_CAP,
    questions_check: questionsCheck,
    required_questions: requiredQuestions.map((q) => q.displayName),
    blocked: questionsCheck === "blocked",
    preview_token: token,
    expires_in_seconds: PREVIEW_TOKEN_TTL_SECONDS,
  });
});
