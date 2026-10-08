/**
 * Runs (or resumes) a Teams event registration batch against Graph and
 * persists every outcome as it happens.
 *
 * State lives in the database, never in memory: items move
 * pending -> registered | already_processed | failed one row at a time, and
 * batch totals/status are always recomputed from the items. A browser
 * refresh, a second tab or a restarted function therefore cannot resubmit
 * anyone — "retry" and "resume" are the same operation over the remaining
 * pending rows.
 */
import type { AdminClient } from "./server.ts";
import { writeAudit } from "./server.ts";
import type { TeamsGraphClient } from "./graph-client.ts";
import { processItems, type ItemOutcome } from "./processor.ts";
import {
  countStatuses,
  deriveBatchStatus,
  toBatchTotals,
  type BatchStatus,
  type BatchTotals,
} from "./batch-status.ts";
import { sanitiseMessage } from "./graph-errors.ts";

/**
 * A `processing` batch with no heartbeat for this long is treated as stalled.
 * Must stay comfortably above PROCESS_DEADLINE_MS plus the longest in-flight
 * Graph call, so a second runner can never overlap a live one.
 */
export const BATCH_STALE_MS = 3 * 60 * 1000;
/** Stay well inside the Edge Function wall-clock limit. */
export const PROCESS_DEADLINE_MS = 120_000;
export const CONCURRENCY = 5;
const HEARTBEAT_EVERY = 10;
const ITEM_PAGE = 1000;

export interface BatchRef {
  id: string;
  event_type: "webinar" | "meeting";
  graph_event_id: string;
  event_display_name: string;
  group_id: number | null;
  group_name: string;
  initiated_by_user_id: string;
}

interface PendingItem {
  id: string;
  first_name: string | null;
  last_name: string | null;
  normalised_email: string | null;
  attempt_count: number;
}

const UNIQUE_VIOLATION = "23505";

async function persistOutcome(admin: AdminClient, item: PendingItem, outcome: ItemOutcome): Promise<void> {
  const nowIso = new Date().toISOString();
  const common = {
    attempt_count: item.attempt_count + outcome.attempts,
    processed_at: nowIso,
    updated_at: nowIso,
  };
  const patch = outcome.kind === "registered"
    ? {
      ...common,
      result_status: "registered",
      graph_registration_id: outcome.registrationId,
      error_code: null,
      error_message: null,
    }
    : outcome.kind === "already_processed"
    ? { ...common, result_status: "already_processed", error_code: null, error_message: null }
    : {
      ...common,
      result_status: "failed",
      error_code: outcome.error.category,
      error_message: sanitiseMessage(outcome.error.message),
    };

  const { error } = await admin.from("teams_event_registration_items").update(patch).eq("id", item.id);
  if (!error) return;

  // Another batch registered this person for the same event between our
  // pre-check and now: the database's success-uniqueness index refused a
  // second success row. That is a skip, not a failure.
  if (error.code === UNIQUE_VIOLATION && patch.result_status === "registered") {
    const { error: retryError } = await admin
      .from("teams_event_registration_items")
      .update({ ...common, result_status: "already_processed", error_code: null, error_message: null })
      .eq("id", item.id);
    if (!retryError) return;
    throw new Error("persist_failed");
  }
  throw new Error("persist_failed");
}

export interface FinaliseResult {
  status: BatchStatus;
  totals: BatchTotals;
  pending: number;
}

/** Recompute totals + lifecycle status from the items table and store them. */
export async function finaliseBatch(admin: AdminClient, batchId: string): Promise<FinaliseResult | null> {
  const statuses: string[] = [];
  for (let from = 0; ; from += ITEM_PAGE) {
    const { data, error } = await admin
      .from("teams_event_registration_items")
      .select("result_status")
      .eq("batch_id", batchId)
      .order("id")
      .range(from, from + ITEM_PAGE - 1);
    if (error) return null;
    const page = (data ?? []) as Array<{ result_status: string }>;
    statuses.push(...page.map((r) => r.result_status));
    if (page.length < ITEM_PAGE) break;
  }

  const counts = countStatuses(statuses);
  const totals = toBatchTotals(counts);
  const status = deriveBatchStatus(counts);
  const nowIso = new Date().toISOString();
  const { error } = await admin
    .from("teams_event_registration_batches")
    .update({
      ...totals,
      status,
      updated_at: nowIso,
      completed_at: status === "processing" ? null : nowIso,
    })
    .eq("id", batchId);
  if (error) return null;
  return { status, totals, pending: counts.pending };
}

export async function markBatchFailed(admin: AdminClient, batchId: string): Promise<void> {
  const nowIso = new Date().toISOString();
  await admin
    .from("teams_event_registration_batches")
    .update({ status: "failed", updated_at: nowIso, completed_at: nowIso })
    .eq("id", batchId);
}

/**
 * Registers every `pending` item of a batch. Safe to call again for the same
 * batch: only rows still pending are touched.
 */
export async function runBatch(admin: AdminClient, graph: TeamsGraphClient, batch: BatchRef): Promise<FinaliseResult | null> {
  const startedAt = Date.now();
  const { data, error } = await admin
    .from("teams_event_registration_items")
    .select("id, first_name, last_name, normalised_email, attempt_count")
    .eq("batch_id", batch.id)
    .eq("result_status", "pending")
    .order("created_at")
    .order("id")
    .limit(5000);
  if (error) {
    await markBatchFailed(admin, batch.id);
    return null;
  }
  const items = (data ?? []) as PendingItem[];

  let persisted = 0;
  const summary = await processItems<PendingItem>(
    items,
    async (item): Promise<ItemOutcome> => {
      if (!item.normalised_email || !item.first_name || !item.last_name) {
        return {
          kind: "failed",
          attempts: 0,
          error: {
            category: "invalid_contact_data",
            retryable: false,
            status: 0,
            code: "invalid_contact_data",
            message: "This person is missing a name or email.",
          },
        };
      }
      const result = await graph.registerWebinarAttendee(batch.graph_event_id, {
        firstName: item.first_name,
        lastName: item.last_name,
        email: item.normalised_email,
      });
      if (result.ok) return { kind: "registered", registrationId: result.registrationId, attempts: result.attempts };
      // Graph says they are already registered: a skip, not a failure.
      if (result.error.category === "duplicate") return { kind: "already_processed", attempts: result.attempts };
      return { kind: "failed", error: result.error, attempts: result.attempts };
    },
    {
      concurrency: CONCURRENCY,
      deadlineAtMs: startedAt + PROCESS_DEADLINE_MS,
      onOutcome: async (item, outcome) => {
        await persistOutcome(admin, item, outcome);
        persisted++;
        if (persisted % HEARTBEAT_EVERY === 0) {
          await admin
            .from("teams_event_registration_batches")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", batch.id);
        }
      },
    },
  );
  if (summary.persistErrors > 0) {
    console.error(`[teams-events] ${summary.persistErrors} outcome(s) could not be persisted for batch ${batch.id}`);
  }

  const result = await finaliseBatch(admin, batch.id);
  if (!result) {
    await markBatchFailed(admin, batch.id);
    return null;
  }

  if (result.status !== "processing") {
    await writeAudit(admin, {
      action: "teams_event_registration.batch_completed",
      actorUserId: batch.initiated_by_user_id,
      batchId: batch.id,
      details: auditDetails(batch, result),
    });
  }
  return result;
}

export function auditDetails(batch: BatchRef, result: { status: string; totals: BatchTotals }): Record<string, unknown> {
  return {
    event_type: batch.event_type,
    graph_event_id: batch.graph_event_id,
    event_display_name: batch.event_display_name,
    group_id: batch.group_id,
    group_name: batch.group_name,
    batch_id: batch.id,
    status: result.status,
    ...result.totals,
  };
}

/**
 * A crashed run leaves its batch `processing` forever, and the live-lock
 * index would then block every future run for that event + group. If the
 * live batch has had no heartbeat for BATCH_STALE_MS it is released
 * (marked failed — its pending rows can still be resumed via retry).
 */
export async function releaseStaleLock(
  admin: AdminClient,
  params: { eventType: string; eventId: string; groupId: number },
): Promise<{ released: boolean; liveBatchId: string | null }> {
  const { data } = await admin
    .from("teams_event_registration_batches")
    .select("id, updated_at")
    .eq("event_type", params.eventType)
    .eq("graph_event_id", params.eventId)
    .eq("group_id", params.groupId)
    .in("status", ["queued", "processing"])
    .maybeSingle();
  const live = data as { id: string; updated_at: string } | null;
  if (!live) return { released: true, liveBatchId: null };
  if (Date.now() - new Date(live.updated_at).getTime() < BATCH_STALE_MS) {
    return { released: false, liveBatchId: live.id };
  }
  await markBatchFailed(admin, live.id);
  return { released: true, liveBatchId: live.id };
}

/** Hand a promise to the runtime so it survives after the HTTP response is sent. */
export function runInBackground(task: Promise<unknown>): void {
  const runtime = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
  }).EdgeRuntime;
  const guarded = task.catch((e) => {
    console.error("[teams-events] background batch failed", sanitiseMessage(e instanceof Error ? e.message : String(e)));
  });
  if (runtime?.waitUntil) runtime.waitUntil(guarded);
}

/** Cap on how many batches one operator may start in a window (bulk-endpoint rate limit). */
export const RATE_LIMIT_BATCHES = 10;
export const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function isRateLimited(admin: AdminClient, userId: string): Promise<boolean> {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count } = await admin
    .from("teams_event_registration_batches")
    .select("id", { count: "exact", head: true })
    .eq("initiated_by_user_id", userId)
    .gte("created_at", since);
  return (count ?? 0) >= RATE_LIMIT_BATCHES;
}
