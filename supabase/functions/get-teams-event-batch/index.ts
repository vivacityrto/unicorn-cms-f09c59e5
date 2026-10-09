/**
 * get-teams-event-batch
 *
 * Progress and per-person results for a Teams event registration batch.
 * Polled by the modal while a batch runs, and used to reopen results later.
 * By default returns every person who was NOT successfully registered
 * (failures, skips, exclusions, duplicates); pass include: "all" for everyone.
 *
 * POST { batch_id: uuid, include?: "problems" | "all" }
 */
import { corsHeadersFor, requireCaller } from "../_shared/requireCaller.ts";
import {
  createAdminClient,
  errorResponse,
  jsonResponse,
  teamsEventsCallerOptions,
} from "../_shared/teams-events/server.ts";
import { countStatuses } from "../_shared/teams-events/batch-status.ts";
import { BATCH_STALE_MS } from "../_shared/teams-events/batch-runner.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 1000;
const ITEM_LIMIT = 2000;

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
  const includeAll = body?.include === "all";

  const { data: batch, error: batchError } = await admin
    .from("teams_event_registration_batches")
    .select(
      "id, event_type, graph_event_id, event_display_name, event_start_datetime, event_timezone, group_id, group_name, " +
        "eligible_count, submitted_count, success_count, skipped_count, failure_count, status, initiated_by_user_id, " +
        "created_at, updated_at, started_at, completed_at",
    )
    .eq("id", batchId)
    .maybeSingle();
  if (batchError) return errorResponse(req, 500, "batch_load_failed", "Could not load the batch.");
  if (!batch) return errorResponse(req, 404, "batch_not_found", "Batch not found.");

  const statuses: string[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("teams_event_registration_items")
      .select("result_status")
      .eq("batch_id", batchId)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return errorResponse(req, 500, "items_load_failed", "Could not load the batch results.");
    const page = (data ?? []) as Array<{ result_status: string }>;
    statuses.push(...page.map((r) => r.result_status));
    if (page.length < PAGE) break;
  }
  const counts = countStatuses(statuses);

  let itemQuery = admin
    .from("teams_event_registration_items")
    .select(
      "id, result_status, inclusion, normalised_email, first_name, last_name, tenant_id, exclusion_reason, error_code, error_message, attempt_count",
    )
    .eq("batch_id", batchId)
    .order("created_at")
    .order("id")
    .limit(ITEM_LIMIT + 1);
  if (!includeAll) itemQuery = itemQuery.not("result_status", "in", "(registered,invited)");
  const { data: itemData, error: itemError } = await itemQuery;
  if (itemError) return errorResponse(req, 500, "items_load_failed", "Could not load the batch results.");
  const items = (itemData ?? []) as unknown[];

  const typedBatch = batch as unknown as { status: string; updated_at: string };
  const live = typedBatch.status === "processing" || typedBatch.status === "queued";
  const stalled = live && Date.now() - new Date(typedBatch.updated_at).getTime() > BATCH_STALE_MS;

  return jsonResponse(req, 200, {
    batch,
    counts,
    items: items.slice(0, ITEM_LIMIT),
    items_truncated: items.length > ITEM_LIMIT,
    stalled,
    // Resume/retry is offered once the run has finished or has gone quiet.
    can_retry: (!live || stalled) && (counts.failed > 0 || counts.pending > 0),
  });
});
