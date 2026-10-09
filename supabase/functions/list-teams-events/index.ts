/**
 * list-teams-events
 *
 * Returns Teams webinars starting from now through the next 14 days, for the
 * "Register for Teams Event" modal. Teams remains the source of truth: nothing
 * is cached or stored here. Meetings are a later phase.
 *
 * POST { event_type?: "webinar" }
 * 200  { events, diagnostics, window: { from, to }, fetched_at }
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
import { computeWindow, selectUpcomingWebinars, summariseWebinarList } from "../_shared/teams-events/event-window.ts";

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
  return jsonResponse(req, 200, {
    events: selectUpcomingWebinars(listed.webinars, now),
    // Counts only (no titles/organisers): explains an empty list.
    diagnostics: summariseWebinarList(listed.webinars, now),
    window: { from: window.from.toISOString(), to: window.to.toISOString() },
    fetched_at: now.toISOString(),
  });
});
