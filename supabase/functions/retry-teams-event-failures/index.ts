/**
 * retry-teams-event-failures
 *
 * Re-runs only the people who failed (or were left pending by an interrupted
 * run) in an existing batch. Everyone already registered, skipped, excluded
 * or duplicate is untouched, so a retry can never double-register anyone.
 *
 * Failures caused by the person's own data (invalid_contact_data) are not
 * retried — the Contact Directory record has to be fixed first. Failures
 * caused by event/tenant state (consent, organiser policy, closed event,
 * throttling, outage) are retryable once the cause is resolved.
 *
 * POST { batch_id: uuid }
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
  writeAudit,
} from "../_shared/teams-events/server.ts";
import { isUsableWebinar } from "../_shared/teams-events/event-window.ts";
import { NON_RETRYABLE_ITEM_CATEGORIES } from "../_shared/teams-events/graph-errors.ts";
import {
  auditDetails,
  type BatchRef,
  BATCH_STALE_MS,
  finaliseBatch,
  isRateLimited,
  markBatchFailed,
  runBatch,
  runInBackground,
} from "../_shared/teams-events/batch-runner.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNIQUE_VIOLATION = "23505";
const SETTLED_STATUSES = ["previewed", "completed", "completed_with_errors", "failed"];

interface BatchRow extends BatchRef {
  status: string;
  updated_at: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });
  if (req.method !== "POST") return errorResponse(req, 405, "method_not_allowed", "Method not allowed");

  const admin = createAdminClient();
  if (!admin) return errorResponse(req, 500, "server_misconfigured", "Server misconfigured");

  const caller = await requireCaller(req, admin, teamsEventsCallerOptions(req));
  if (!caller.ok) return caller.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const batchId = typeof body?.batch_id === "string" ? body.batch_id : "";
  if (!UUID.test(batchId)) return errorResponse(req, 400, "invalid_request", "batch_id is required");

  if (await isRateLimited(admin, caller.user.id)) {
    return errorResponse(req, 429, "rate_limited", "Too many registration batches started recently. Try again shortly.");
  }

  const { data, error: loadError } = await admin
    .from("teams_event_registration_batches")
    .select("id, event_type, graph_event_id, event_display_name, group_id, group_name, initiated_by_user_id, status, updated_at")
    .eq("id", batchId)
    .maybeSingle();
  if (loadError) return errorResponse(req, 500, "batch_load_failed", "Could not load the batch.");
  const stored = data as BatchRow | null;
  if (!stored) return errorResponse(req, 404, "batch_not_found", "Batch not found.");
  if (stored.event_type !== "webinar") {
    return errorResponse(req, 501, "meetings_not_supported", "Teams Meetings are not available yet.");
  }

  // A batch that is still running (fresh heartbeat) must be left alone; a
  // stalled one is released so its remaining pending people can be resumed.
  const live = stored.status === "processing" || stored.status === "queued";
  if (live) {
    if (Date.now() - new Date(stored.updated_at).getTime() < BATCH_STALE_MS) {
      return errorResponse(req, 409, "batch_in_progress", "This batch is still running.", { batch_id: batchId });
    }
    await markBatchFailed(admin, batchId);
  }

  const graph = createGraphFromEnv();
  if (!graph.ok) return notConfiguredResponse(req);

  // The event must still exist and be published; a cancelled event is not retryable.
  const fetched = await graph.client.getWebinar(stored.graph_event_id);
  if (!fetched.ok) return graphErrorResponse(req, fetched.error);
  if (!isUsableWebinar({ ...fetched.webinar, id: stored.graph_event_id })) {
    return errorResponse(req, 409, "event_unavailable", "This event is not published or is no longer available.");
  }

  // Atomically claim the batch. Zero rows updated means another operator got
  // there first; a unique violation means a different live batch now holds
  // the event + group lock.
  const nowIso = new Date().toISOString();
  const claim = await admin
    .from("teams_event_registration_batches")
    .update({ status: "processing", updated_at: nowIso, completed_at: null })
    .eq("id", batchId)
    .in("status", SETTLED_STATUSES)
    .select("id");
  if (claim.error) {
    return claim.error.code === UNIQUE_VIOLATION
      ? errorResponse(req, 409, "batch_in_progress", "Another registration for this event and group is already running.")
      : errorResponse(req, 500, "batch_claim_failed", "Could not restart the batch.");
  }
  if (!claim.data || claim.data.length === 0) {
    return errorResponse(req, 409, "batch_in_progress", "This batch is already being retried.", { batch_id: batchId });
  }

  // Failed people go back to pending, except those whose own data is bad.
  const retryable = await admin
    .from("teams_event_registration_items")
    .update({ result_status: "pending", error_code: null, error_message: null, updated_at: nowIso })
    .eq("batch_id", batchId)
    .eq("result_status", "failed")
    .not("error_code", "in", `(${[...NON_RETRYABLE_ITEM_CATEGORIES].join(",")})`)
    .select("id");
  if (retryable.error) {
    await finaliseBatch(admin, batchId);
    return errorResponse(req, 500, "retry_prepare_failed", "Could not prepare the failed people for retry.");
  }

  const batch: BatchRef = {
    id: batchId,
    event_type: "webinar",
    graph_event_id: stored.graph_event_id,
    event_display_name: stored.event_display_name,
    group_id: stored.group_id,
    group_name: stored.group_name,
    initiated_by_user_id: caller.user.id,
  };

  const settled = await finaliseBatch(admin, batchId);
  if (!settled || settled.pending === 0) {
    return jsonResponse(req, 200, {
      batch_id: batchId,
      status: settled?.status ?? "completed",
      retried: 0,
      message: "There are no retryable people in this batch.",
    });
  }

  await writeAudit(admin, {
    action: "teams_event_registration.retry_started",
    actorUserId: caller.user.id,
    batchId,
    details: { ...auditDetails(batch, { status: "processing", totals: settled.totals }), retry_count: settled.pending },
  });

  runInBackground(runBatch(admin, graph.client, batch));

  return jsonResponse(req, 202, { batch_id: batchId, status: "processing", retried: settled.pending });
});
