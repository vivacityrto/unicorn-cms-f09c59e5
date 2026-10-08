/**
 * Batch totals and lifecycle status derived from item result statuses.
 * Totals are always recomputed from the items table (the source of truth),
 * never incremented in memory, so a restarted run cannot drift.
 */

export type ItemResultStatus =
  | "pending"
  | "registered"
  | "invited"
  | "already_processed"
  | "excluded"
  | "duplicate"
  | "failed";

export type ItemStatusCounts = Record<ItemResultStatus, number>;

export type BatchStatus =
  | "previewed"
  | "queued"
  | "processing"
  | "completed"
  | "completed_with_errors"
  | "failed";

export interface BatchTotals {
  eligible_count: number;
  submitted_count: number;
  success_count: number;
  skipped_count: number;
  failure_count: number;
}

export function emptyStatusCounts(): ItemStatusCounts {
  return {
    pending: 0,
    registered: 0,
    invited: 0,
    already_processed: 0,
    excluded: 0,
    duplicate: 0,
    failed: 0,
  };
}

export function countStatuses(statuses: Iterable<string>): ItemStatusCounts {
  const counts = emptyStatusCounts();
  for (const status of statuses) {
    if (status in counts) counts[status as ItemResultStatus]++;
  }
  return counts;
}

/**
 *   eligible  = people the group resolved to who could be registered
 *               (everything except excluded / duplicate rows)
 *   submitted = people actually sent to Graph (succeeded or failed there)
 *   success   = registered + invited
 *   skipped   = not sent to Graph: already processed, excluded or duplicate
 *   failure   = failed in Graph
 */
export function toBatchTotals(c: ItemStatusCounts): BatchTotals {
  return {
    eligible_count: c.pending + c.registered + c.invited + c.already_processed + c.failed,
    submitted_count: c.registered + c.invited + c.failed,
    success_count: c.registered + c.invited,
    skipped_count: c.already_processed + c.excluded + c.duplicate,
    failure_count: c.failed,
  };
}

export function deriveBatchStatus(c: ItemStatusCounts): BatchStatus {
  if (c.pending > 0) return "processing";
  if (c.failed === 0) return "completed";
  const anyGood = c.registered + c.invited + c.already_processed > 0;
  return anyGood ? "completed_with_errors" : "failed";
}
