# Audit: 2026-08-19 — reclaim_stale_bulk_document_locks counter/completion fix + worker eager lease release

**Trigger:** ad-hoc — Carl asked to investigate the 29-30 skipped and some failed items on job
`85e00e30-ac1f-472b-84f2-6040f6c1847f`, the same job used to verify the pagination fix and the
system-account auto-refresh mechanism earlier this week.
**Scope:** `public.reclaim_stale_bulk_document_locks`, `bulk-generate-documents-worker`. No RLS
change; one existing SECURITY DEFINER function's body changed, plus a one-off data backfill on
job 85e00e30's counters.

## Findings

**Skipped items (30 on job 85e00e30) — not a bug.** All carry `outcome.reason =
'no_published_version'`. Confirmed via `document_versions` that the affected documents (11
distinct titles, e.g. `CP.S3 Validation Credentials Policy`, `Q1.D2-Assessment Policy`) each have
exactly one version, and that version has never been published — a content-workflow gap, not a
worker defect. Every tenant will keep skipping these specific documents until someone publishes
them.

**Failed items (found 25-26 real rows, but `bulk_document_jobs.failed_count` said 0) — two real
bugs:**

1. `reclaim_stale_bulk_document_locks()` finalizes an item as `failed` (after `attempt_count >=
   5`) with a direct `UPDATE` on `bulk_document_job_items`, but never touches
   `bulk_document_jobs.failed_count`/`error_summary` — those counters are only maintained by
   `record_bulk_document_item_outcome`, which this function never calls. Confirmed live: job
   85e00e30 had 25 (later 26) real `state='failed'` rows while its own `failed_count` read 0. A
   sweep across all jobs found this drift nowhere else in the *undercounting* direction — but
   found 7 unrelated, already-`completed` jobs with the *opposite* drift (`failed_count=1`,
   actual failed items=0), a different bug (likely `skip_items` not decrementing a
   previously-failed item's count) that this session did not fix — flagged, not touched, since
   those jobs are inert and the root cause needs its own investigation before altering history.
2. A second, related gap: nothing marks a job `completed` when its *last* remaining
   pending/leased item is finalized by this function rather than by
   `record_bulk_document_item_outcome` (the only other place that runs a completion check). Such
   a job would stay `running` forever with zero open items — the existing "mark stalled" check in
   the same function only fires when open items still *exist* but are stale, not when there are
   none left at all.

**Root cause of *why* items reach 5 failed attempts in the first place** — a genuine worker
reliability bug, not bad luck on specific documents/tenants. Checked actual `function_logs` for
the job's invocations: each ~50-57s invocation only completes ~3 of the 5 items it leases
(`lease_bulk_document_job_items` leases one item per tenant, up to `LEASE_BATCH=5`) before hitting
`TIME_BUDGET_MS`. The other 2 stay `leased` under that invocation's `worker_id`. Previously they
sat idle until their 2-minute lease expired *and* the next 5-minute `pg_cron` tick
(`reclaim_stale_bulk_document_locks` runs `*/5 * * * *`) reclaimed them back to `pending` — a
20-40 minute round trip confirmed by comparing failed items' `started_at`/`finished_at` gaps
against 5 max-attempt cycles. Nothing was ever actually wrong with these items; they just kept
losing the race to be reached before each invocation's time budget ran out, cycle after cycle,
until `reclaim_stale_bulk_document_locks` gave up on them.

## Fix

1. `reclaim_stale_bulk_document_locks`: rewritten so the initial reset statement also bumps the
   owning job's `failed_count`/`error_summary` for items it finalizes as `failed` in the same
   statement (safe to chain — that counter bump only reads the reset step's own `RETURNING` rows,
   never re-scans `bulk_document_job_items`, so it isn't subject to the same-statement-snapshot
   limitation that keeps the *next* part as a separate statement). Added a second, separate
   statement — run after the reset so it sees the now-committed item-state changes — that marks a
   `running` job `completed` (or `cancelled` if already cancelled) once it has zero remaining
   pending/leased items, mirroring `record_bulk_document_item_outcome`'s exact completion rule.
   The pre-existing "mark stalled" statement is unchanged.
2. Backfilled job 85e00e30's `failed_count` to 26 and merged `LEASE_EXPIRED_MAX_ATTEMPTS: 26` into
   its `error_summary` directly, since the fix above only prevents *future* drift — it doesn't
   retroactively correct a job's already-wrong counter.
3. `bulk-generate-documents-worker`: added an eager release step right before the "re-invoke if
   more work" check — any item still `leased` under *this* invocation's `worker_id` (the
   stragglers that didn't get processed before the time budget hit) is immediately reset to
   `pending` (state/lease fields only — `attempt_count` is untouched, since this isn't a new
   attempt, it's returning one that was never actually made). The very next self re-invocation
   (moments away, not minutes) can then pick it up, instead of waiting on the lease-expiry +
   cron-tick round trip above.

## Decisions

- Did not change `LEASE_BATCH` (5) or `TIME_BUDGET_MS` (50s) — the eager-release fix removes the
  reliability problem (items no longer get stranded for minutes) without needing to retune
  batch/time-budget throughput.
- Did not fix the 7 historical completed jobs with the opposite counter drift — different root
  cause, zero operational impact (already terminal), and correcting historical stats without
  understanding the actual cause risked masking a real, still-live bug elsewhere. Parked below.
- Chose to eagerly release *all* of an invocation's own still-leased items unconditionally
  (rather than only when `timedOut` specifically caused the loop to end) — also benefits the
  pre-existing "transient bootstrap failure, deliberately left leased" path (see
  `ensureSharepoint`'s inline comment), which previously relied on the same slow lease-expiry
  path. Considered whether this removes a useful backoff for transient failures (e.g. a
  struggling SharePoint API) — concluded the change is modest (retry ~1 min later via the next
  self re-invoke, vs ~2-5 min before) and not worth the added complexity of excluding that path
  from the eager release.

## Open questions parked

- The 7 completed jobs with `failed_count` overcounted by 1 (opposite direction from the bug fixed
  here) — likely `skip_items`/a similar RPC not decrementing `failed_count` when a
  previously-`failed` item is skipped instead of retried. Not investigated this session.
- No end-to-end observation yet of the eager-release fix actually preventing a
  `LEASE_EXPIRED_MAX_ATTEMPTS` failure in production — job 85e00e30 is still running under the
  new worker version as of this entry; worth checking back on its failed-item count growth rate.
