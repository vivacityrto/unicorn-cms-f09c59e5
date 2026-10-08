/**
 * register-teams-webinar-group
 *
 * Registers the CURRENT members of a Contact Directory Group for a Teams
 * webinar. The caller must present the preview token minted by
 * preview-teams-event-group; the group is nonetheless re-resolved here and
 * the membership fingerprint compared, so a membership change between
 * preview and confirmation is rejected instead of silently processed.
 *
 * Returns 202 as soon as the batch and its items are persisted; processing
 * continues in the background and progress is read via get-teams-event-batch.
 *
 * POST { event_id, group_id, preview_token }
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
  writeAudit,
} from "../_shared/teams-events/server.ts";
import { isUsableWebinar, isWithinWindow, toEventSummary } from "../_shared/teams-events/event-window.ts";
import { resolveGroupForEvent } from "../_shared/teams-events/group-resolution.ts";
import { verifyPreviewToken } from "../_shared/teams-events/preview-token.ts";
import {
  auditDetails,
  type BatchRef,
  finaliseBatch,
  isRateLimited,
  markBatchFailed,
  releaseStaleLock,
  runBatch,
  runInBackground,
} from "../_shared/teams-events/batch-runner.ts";

const UNIQUE_VIOLATION = "23505";
const ITEM_INSERT_CHUNK = 200;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeadersFor(req) });
  if (req.method !== "POST") return errorResponse(req, 405, "method_not_allowed", "Method not allowed");

  const admin = createAdminClient();
  if (!admin) return errorResponse(req, 500, "server_misconfigured", "Server misconfigured");

  const caller = await requireCaller(req, admin, teamsEventsCallerOptions(req));
  if (!caller.ok) return caller.response;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const eventId = parseEventId(body?.event_id);
  const groupId = parsePositiveInt(body?.group_id);
  if (!eventId || !groupId || typeof body?.preview_token !== "string") {
    return errorResponse(req, 400, "invalid_request", "event_id, group_id and preview_token are required");
  }

  if (await isRateLimited(admin, caller.user.id)) {
    return errorResponse(req, 429, "rate_limited", "Too many registration batches started recently. Try again shortly.");
  }

  const verified = await verifyPreviewToken(
    body.preview_token,
    previewSigningSecret(),
    { uid: caller.user.id, eventType: "webinar", eventId, groupId },
    Math.floor(Date.now() / 1000),
  );
  if (!verified.ok) {
    return errorResponse(
      req,
      verified.reason === "expired" ? 410 : 400,
      verified.reason === "expired" ? "preview_expired" : "preview_invalid",
      verified.reason === "expired"
        ? "The preview has expired. Preview the event and group again before confirming."
        : "The preview could not be verified. Preview the event and group again.",
    );
  }

  const graph = createGraphFromEnv();
  if (!graph.ok) return notConfiguredResponse(req);

  const fetched = await graph.client.getWebinar(eventId);
  if (!fetched.ok) return graphErrorResponse(req, fetched.error);
  const event = toEventSummary({ ...fetched.webinar, id: eventId });
  if (!isUsableWebinar({ ...fetched.webinar, id: eventId }) || !event) {
    return errorResponse(req, 409, "event_unavailable", "This event is not published or is no longer available.");
  }
  if (!isWithinWindow(new Date(event.startUtc), new Date())) {
    return errorResponse(req, 409, "event_out_of_window", "This event is outside the next 14 days.");
  }

  // Never trust the browser: reload the group and compare to what was previewed.
  const result = await resolveGroupForEvent(admin, { eventType: "webinar", eventId, groupId });
  if (!result.ok) {
    return result.reason === "not_found"
      ? errorResponse(req, 404, "group_not_found", "That Contact Directory Group no longer exists.")
      : errorResponse(req, 500, "group_resolution_failed", "Could not load the group's members.");
  }
  const { group, classification, fingerprint, memberCount, alreadyProcessed } = result.resolved;
  if (fingerprint !== verified.claims.membershipHash || memberCount !== verified.claims.memberCount) {
    return errorResponse(
      req,
      409,
      "membership_changed",
      "The group's members changed since the preview. Preview again to confirm the updated list.",
    );
  }

  const questions = await graph.client.listRegistrationQuestions(eventId);
  if (questions.ok && questions.questions.some((q) => q.isRequired)) {
    return errorResponse(
      req,
      422,
      "required_questions",
      "This webinar has required registration questions that Unicorn cannot answer automatically.",
    );
  }

  // Create the batch. The live-lock unique index (one queued/processing batch
  // per event + group) is what stops two operators racing each other.
  const startedAt = new Date().toISOString();
  const batchRow = {
    event_type: "webinar",
    graph_event_id: eventId,
    event_display_name: event.displayName,
    event_start_datetime: event.startUtc,
    event_timezone: "Australia/Sydney",
    graph_organiser_id: event.organiserId,
    group_id: group.id,
    group_name: group.name,
    status: "processing",
    initiated_by_user_id: caller.user.id,
    started_at: startedAt,
    updated_at: startedAt,
  };

  let inserted = await admin.from("teams_event_registration_batches").insert(batchRow).select("id").single();
  if (inserted.error?.code === UNIQUE_VIOLATION) {
    const lock = await releaseStaleLock(admin, { eventType: "webinar", eventId, groupId: group.id });
    if (!lock.released) {
      return errorResponse(
        req,
        409,
        "batch_in_progress",
        "Another registration for this event and group is already running.",
        { batch_id: lock.liveBatchId },
      );
    }
    inserted = await admin.from("teams_event_registration_batches").insert(batchRow).select("id").single();
  }
  if (inserted.error || !inserted.data) {
    const code = inserted.error?.code === UNIQUE_VIOLATION ? "batch_in_progress" : "batch_create_failed";
    return errorResponse(req, code === "batch_in_progress" ? 409 : 500, code, "Could not start the registration batch.");
  }
  const batchId = (inserted.data as { id: string }).id;

  // Snapshot every resolved person (eligible, excluded, duplicate) so results
  // and exclusions are reportable and retryable from the secured items table.
  const nowIso = new Date().toISOString();
  const itemRows = classification.members.map((m) => {
    const base = {
      batch_id: batchId,
      tenant_id: m.member.tenantId,
      tenant_user_id: m.member.memberType === "user" ? m.member.memberId : null,
      tenant_contact_id: m.member.memberType === "contact" ? m.member.memberId : null,
      event_type: "webinar",
      graph_event_id: eventId,
      normalised_email: m.normalisedEmail,
      first_name: m.member.firstName?.trim() || null,
      last_name: m.member.lastName?.trim() || null,
      created_at: nowIso,
      updated_at: nowIso,
    };
    if (m.kind === "excluded") {
      return { ...base, result_status: "excluded", exclusion_reason: m.reason };
    }
    if (m.kind === "duplicate") {
      return { ...base, result_status: "duplicate", exclusion_reason: `duplicate_of:${m.duplicateOf}` };
    }
    return {
      ...base,
      result_status: alreadyProcessed.has(m.normalisedEmail) ? "already_processed" : "pending",
      exclusion_reason: null,
    };
  });

  for (let i = 0; i < itemRows.length; i += ITEM_INSERT_CHUNK) {
    const { error } = await admin.from("teams_event_registration_items").insert(itemRows.slice(i, i + ITEM_INSERT_CHUNK));
    if (error) {
      await markBatchFailed(admin, batchId);
      return errorResponse(req, 500, "item_create_failed", "Could not record the batch's people.");
    }
  }

  const totals = await finaliseBatch(admin, batchId);
  const batch: BatchRef = {
    id: batchId,
    event_type: "webinar",
    graph_event_id: eventId,
    event_display_name: event.displayName,
    group_id: group.id,
    group_name: group.name,
    initiated_by_user_id: caller.user.id,
  };
  await writeAudit(admin, {
    action: "teams_event_registration.batch_started",
    actorUserId: caller.user.id,
    batchId,
    details: auditDetails(batch, {
      status: "processing",
      totals: totals?.totals ?? {
        eligible_count: 0,
        submitted_count: 0,
        success_count: 0,
        skipped_count: 0,
        failure_count: 0,
      },
    }),
  });

  runInBackground(runBatch(admin, graph.client, batch));

  return jsonResponse(req, 202, {
    batch_id: batchId,
    status: totals?.status ?? "processing",
    totals: totals?.totals ?? null,
  });
});
