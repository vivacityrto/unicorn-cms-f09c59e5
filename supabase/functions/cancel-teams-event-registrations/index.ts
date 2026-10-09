/**
 * cancel-teams-event-registrations
 *
 * Cancels people's Teams registrations for ONE webinar, e.g. after someone is
 * removed from a Contact Directory Group or no longer needs to attend.
 *
 * The browser sends only an event id and a list of directory keys
 * (`user:12`, `contact:5`). Each person is re-resolved from the source tables,
 * matched to their registration in Teams by normalised email (app-only
 * registration returns no registration id), and cancelled. Local result rows
 * for them are marked `cancelled` so a later run can register them again.
 *
 * Microsoft documents only a narrow per-event permission for an app-only
 * cancel, so a refusal is expected to be possible. It is reported per person
 * with a safe error category and the UI tells the operator to remove them in
 * Teams instead; one refusal never stops the others.
 *
 * POST { event_id: string, member_keys: string[] }
 * 200  { event, outcomes: [{ member_key, status, error_code?, message? }], counts }
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
  teamsEventsCallerOptions,
  writeAudit,
} from "../_shared/teams-events/server.ts";
import { loadMembersByKeys } from "../_shared/teams-events/group-resolution.ts";
import { memberKey, parseMemberKeys } from "../_shared/teams-events/membership.ts";
import { normaliseEmail } from "../_shared/teams-events/emails.ts";
import { mapWithLimit, toEventSummary } from "../_shared/teams-events/event-window.ts";
import {
  type CancelOutcome,
  planCancellations,
  summariseCancelOutcomes,
} from "../_shared/teams-events/cancel.ts";
import type { ClassifiedGraphError } from "../_shared/teams-events/graph-errors.ts";

const MAX_CANCEL_PEOPLE = 50;
const CANCEL_CONCURRENCY = 3;
/** Bulk-endpoint rate limit: cancellations requested per operator per window. */
const RATE_LIMIT_REQUESTS = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const AUDIT_ACTION = "teams_event_registration.cancelled";

function failed(key: string, error: ClassifiedGraphError | { category: string; message: string }): CancelOutcome {
  return { member_key: key, status: "failed", error_code: error.category, message: error.message };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });
  if (req.method !== "POST") return errorResponse(req, 405, "method_not_allowed", "Method not allowed");

  const admin = createAdminClient();
  if (!admin) return errorResponse(req, 500, "server_misconfigured", "Server misconfigured");

  const caller = await requireCaller(req, admin, teamsEventsCallerOptions(req));
  if (!caller.ok) return caller.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const eventId = parseEventId(body?.event_id);
  const people = parseMemberKeys(body?.member_keys, MAX_CANCEL_PEOPLE);
  if (!eventId || !people.ok || people.keys.length === 0) {
    return errorResponse(
      req,
      400,
      "invalid_request",
      `event_id and 1-${MAX_CANCEL_PEOPLE} member_keys (user:<id> / contact:<id>) are required`,
    );
  }

  // Light rate limit on this bulk endpoint, counted from the audit trail.
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count: recent } = await admin
    .from("client_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("actor_user_id", caller.user.id)
    .eq("action", AUDIT_ACTION)
    .gte("created_at", since);
  if ((recent ?? 0) >= RATE_LIMIT_REQUESTS) {
    return errorResponse(req, 429, "rate_limited", "Too many cancellations requested recently. Try again shortly.");
  }

  const graph = createGraphFromEnv();
  if (!graph.ok) return notConfiguredResponse(req);

  const fetched = await graph.client.getWebinar(eventId);
  if (!fetched.ok) return graphErrorResponse(req, fetched.error);
  const event = toEventSummary({ ...fetched.webinar, id: eventId });

  // Resolve the people from the source tables — never from anything the browser sent.
  const resolved = await loadMembersByKeys(admin, people.keys);
  if (!resolved.ok) return errorResponse(req, 500, "person_lookup_failed", "Could not look up those people.");
  const byKey = new Map(resolved.members.map((m) => [memberKey(m), m]));

  const outcomes: CancelOutcome[] = [];
  const toMatch: Array<{ key: string; email: string | null }> = [];
  for (const key of people.keys) {
    const member = byKey.get(key);
    if (!member) {
      outcomes.push(failed(key, { category: "person_not_found", message: "That person no longer exists in the directory." }));
    } else {
      toMatch.push({ key, email: member.email });
    }
  }

  // One look at the event's registrations, then match everyone by email.
  const listed = toMatch.length > 0 ? await graph.client.listRegistrations(eventId) : null;
  if (listed && !listed.ok) {
    for (const person of toMatch) outcomes.push(failed(person.key, listed.error));
  } else if (listed && listed.ok) {
    const plan = planCancellations(toMatch, listed.registrations);
    const planned = await mapWithLimit(plan, CANCEL_CONCURRENCY, async (entry): Promise<CancelOutcome> => {
      if (entry.kind === "invalid_email") {
        return failed(entry.key, { category: "invalid_contact_data", message: "This person has no valid email, so their registration cannot be matched." });
      }
      if (entry.kind === "not_registered") {
        return listed.capped
          ? failed(entry.key, { category: "list_incomplete", message: "This webinar has too many registrations to check automatically." })
          : { member_key: entry.key, status: "not_registered" };
      }
      for (const registrationId of entry.registrationIds) {
        const result = await graph.client.cancelRegistration(eventId, registrationId);
        if (!result.ok) return failed(entry.key, result.error);
      }
      return { member_key: entry.key, status: "cancelled" };
    });
    outcomes.push(...planned);
  }

  // Keep our own records honest: anyone Teams no longer holds as registered is no longer "registered" here,
  // which also lets a later run register them again (the success-uniqueness index ignores 'cancelled').
  const settledEmails = outcomes
    .filter((o) => o.status === "cancelled" || o.status === "not_registered")
    .map((o) => normaliseEmail(byKey.get(o.member_key)?.email))
    .filter((e): e is string => !!e);
  if (settledEmails.length > 0) {
    const { error } = await admin
      .from("teams_event_registration_items")
      .update({ result_status: "cancelled", updated_at: new Date().toISOString() })
      .eq("event_type", "webinar")
      .eq("graph_event_id", eventId)
      .in("result_status", ["registered", "invited"])
      .in("normalised_email", settledEmails);
    if (error) console.error("[teams-events] could not mark items cancelled");
  }

  const counts = summariseCancelOutcomes(outcomes);
  await writeAudit(admin, {
    action: AUDIT_ACTION,
    actorUserId: caller.user.id,
    batchId: eventId,
    entityType: "teams_event",
    // Counts and ids only: who they are stays in the secured items table.
    details: {
      event_type: "webinar",
      graph_event_id: eventId,
      event_display_name: event?.displayName ?? null,
      requested_count: people.keys.length,
      cancelled_count: counts.cancelled,
      not_registered_count: counts.not_registered,
      failed_count: counts.failed,
    },
  });

  return jsonResponse(req, 200, {
    event: event ? { id: event.id, displayName: event.displayName, startUtc: event.startUtc } : { id: eventId },
    outcomes,
    counts,
  });
});
