/**
 * list-teams-events
 *
 * Returns Teams webinars starting from now through the next 14 days, for the
 * "Register for Teams Event" modal. Teams remains the source of truth: nothing
 * is cached or stored here. Meetings are a later phase.
 *
 * POST { event_type?: "webinar" }
 * 200  { events (each with description + registrants), diagnostics, window: { from, to }, fetched_at }
 */
import { corsHeadersFor, requireCaller } from "../_shared/requireCaller.ts";
import {
  createAdminClient,
  createGraphFromEnv,
  errorResponse,
  graphErrorResponse,
  jsonResponse,
  notConfiguredResponse,
  teamsEventsCallerOptions,
} from "../_shared/teams-events/server.ts";
import {
  computeWindow,
  mapWithLimit,
  selectUpcomingWebinars,
  summariseWebinarList,
} from "../_shared/teams-events/event-window.ts";

const COUNT_CONCURRENCY = 4;
const MAX_EVENTS_WITH_COUNTS = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });
  if (req.method !== "POST") return errorResponse(req, 405, "method_not_allowed", "Method not allowed");

  const admin = createAdminClient();
  if (!admin) return errorResponse(req, 500, "server_misconfigured", "Server misconfigured");

  const caller = await requireCaller(req, admin, teamsEventsCallerOptions(req));
  if (!caller.ok) return caller.response;

  const body = await req.json().catch(() => ({}));
  const eventType = (body as { event_type?: unknown })?.event_type ?? "webinar";
  if (eventType === "meeting") {
    return errorResponse(req, 501, "meetings_not_supported", "Teams Meetings are not available yet. Choose Webinars.");
  }
  if (eventType !== "webinar") return errorResponse(req, 400, "invalid_event_type", "event_type must be 'webinar'");

  const graph = createGraphFromEnv();
  if (!graph.ok) return notConfiguredResponse(req);

  const listed = await graph.client.listWebinars();
  if (!listed.ok) return graphErrorResponse(req, listed.error);

  const now = new Date();
  const window = computeWindow(now);
  const upcoming = selectUpcomingWebinars(listed.webinars, now);

  // Registrant counts are display-only and best effort: if Microsoft refuses
  // the call for any event, that card shows "not available" and the rest of
  // the listing is unaffected. Bounded so a long list cannot cause a burst.
  const events = upcoming.length > MAX_EVENTS_WITH_COUNTS
    ? upcoming.map((event) => ({ ...event, registrants: null }))
    : await mapWithLimit(upcoming, COUNT_CONCURRENCY, async (event) => {
      const counted = await graph.client.countRegistrations(event.id);
      return {
        ...event,
        registrants: counted.ok
          ? { registered: counted.registered, pending: counted.pending, capped: counted.capped }
          : null,
      };
    });

  return jsonResponse(req, 200, {
    events,
    // Why a webinar might be missing: counts plus upcoming webinars we did not list.
    diagnostics: summariseWebinarList(listed.webinars, now),
    window: { from: window.from.toISOString(), to: window.to.toISOString() },
    fetched_at: now.toISOString(),
  });
});
