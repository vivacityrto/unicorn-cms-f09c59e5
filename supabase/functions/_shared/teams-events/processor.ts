/**
 * Bulk processing loop (brief section 13): controlled concurrency, every
 * person processed independently, results persisted as they arrive so a
 * browser refresh or function restart never loses progress.
 *
 * Event-level circuit breaker: when several consecutive attempts fail for a
 * reason that applies to the whole event (consent, organiser policy, event
 * closed) the remaining people are failed immediately with the same
 * classified error instead of hammering Graph N more times. Each person
 * still gets their own recorded result, and the operator can retry once the
 * cause is fixed.
 */
import { EVENT_LEVEL_CATEGORIES, type ClassifiedGraphError } from "./graph-errors.ts";

export type ItemOutcome =
  | { kind: "registered"; registrationId: string | null; attempts: number }
  | { kind: "already_processed"; attempts: number }
  | { kind: "failed"; error: ClassifiedGraphError; attempts: number };

export interface ProcessOptions<T> {
  concurrency: number;
  /** Stop picking up new items after this epoch-ms time (leave them pending). */
  deadlineAtMs?: number;
  /** Consecutive event-level failures before the breaker trips. Default 3. */
  breakerThreshold?: number;
  /** Persist one outcome. Must not throw for ordinary DB hiccups; if it does it is counted. */
  onOutcome: (item: T, outcome: ItemOutcome) => Promise<void>;
  now?: () => number;
}

export interface ProcessSummary {
  processed: number;
  /** Left untouched (still pending) because the deadline passed. */
  deferred: number;
  /** Failed without a Graph call because the breaker had tripped. */
  shortCircuited: number;
  persistErrors: number;
}

export async function processItems<T>(
  items: T[],
  worker: (item: T) => Promise<ItemOutcome>,
  options: ProcessOptions<T>,
): Promise<ProcessSummary> {
  const now = options.now ?? Date.now;
  const threshold = options.breakerThreshold ?? 3;
  const concurrency = Math.max(1, Math.min(options.concurrency, items.length || 1));

  let cursor = 0;
  let consecutiveEventLevel = 0;
  let tripped: ClassifiedGraphError | null = null;
  const summary: ProcessSummary = { processed: 0, deferred: 0, shortCircuited: 0, persistErrors: 0 };

  async function runWorker(): Promise<void> {
    for (;;) {
      if (options.deadlineAtMs !== undefined && now() >= options.deadlineAtMs) return;
      const index = cursor++;
      if (index >= items.length) return;
      const item = items[index];

      let outcome: ItemOutcome;
      if (tripped) {
        outcome = { kind: "failed", error: tripped, attempts: 0 };
        summary.shortCircuited++;
      } else {
        try {
          outcome = await worker(item);
        } catch {
          outcome = {
            kind: "failed",
            attempts: 1,
            error: {
              category: "unknown",
              retryable: false,
              status: 0,
              code: "worker_error",
              message: "Unexpected error while processing this person.",
            },
          };
        }
        if (outcome.kind === "failed" && EVENT_LEVEL_CATEGORIES.has(outcome.error.category)) {
          consecutiveEventLevel++;
          if (consecutiveEventLevel >= threshold) tripped = outcome.error;
        } else {
          consecutiveEventLevel = 0;
        }
      }

      try {
        await options.onOutcome(item, outcome);
      } catch {
        summary.persistErrors++;
      }
      summary.processed++;
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => runWorker()));
  summary.deferred = Math.max(0, items.length - summary.processed);
  return summary;
}
