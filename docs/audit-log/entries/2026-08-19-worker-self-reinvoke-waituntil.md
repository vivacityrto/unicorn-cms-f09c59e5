# Audit: 2026-08-19 — bulk-generate-documents-worker self re-invoke chain death fixed

**Trigger:** Carl asked to check on job `85e00e30-ac1f-472b-84f2-6040f6c1847f` — its "retry
unpublished" follow-up jobs (via `requeue_skipped_bulk_document_items`, see the same-day
requeue-skipped entry) had completed, but the original job "doesn't seem to be generating
anymore."
**Scope:** `bulk-generate-documents-worker` edge function only. No migration, no RLS/trigger
change — the one DB write in this session was a state-transition call to the existing
`stall_bulk_document_job` RPC, not a schema change.

## Findings

Job `85e00e30` was still `status='running'` with 7,733 items sitting in plain `pending` state (no
active leases). `function_logs` showed the worker had been invoking itself every ~1 minute from
02:37 to 03:00 UTC, each cycle processing exactly 3 items before hitting `TIME_BUDGET_MS` and
re-invoking itself — then at `03:00:18.416Z` the cycle's `END` log fired, immediately followed by
a `POST 503` on the worker's own endpoint (visible in `edge_logs` at the same timestamp), and
**nothing since**. No further `START job=85e00e30` line exists in the logs after that point, ~54
minutes before this investigation.

Root cause: the worker's self re-invoke was a bare fire-and-forget call —
`fetch(selfUrl, {...}).catch(...)` — with no `EdgeRuntime.waitUntil()` wrapper, unlike
`kickoffWorker` in `bulk-generate-documents-launcher`, which already uses that pattern correctly.
Without `waitUntil`, the edge runtime is free to tear down the isolate immediately after the
invocation's HTTP response is returned, which can (and, on this occasion, did) kill the outbound
re-invoke request before it was actually sent — silently ending the entire processing chain with
no error ever logged, since the `.catch()` handler itself never got to run.

Compounding this: nothing else in the system is positioned to notice or recover from "a `running`
job whose invocation chain has gone quiet." `reclaim_stale_bulk_document_locks` (the existing
5-minute cron safety net) only resets items stuck in `leased` state past their lease expiry — it
has nothing to reclaim when items are sitting in plain `pending` with no active lease. And the
frontend's Retry button is deliberately hidden whenever `job.status === "running"`
(`canRetry = (eligibleRetry > 0 || isStalled) && job.status !== "running"`), so there was no
self-service way for Carl to nudge the job either, even though 28 failed items already made it
RPC-eligible for retry.

## Fix

1. `bulk-generate-documents-worker`: the self re-invoke `fetch` is now assigned to a `reinvoke`
   promise (with a `.then`/`.catch` that logs a non-2xx response body, matching the launcher's
   `kickoffWorker` error-visibility pattern) and registered via
   `EdgeRuntime.waitUntil(reinvoke)` when that global is available, exactly mirroring
   `kickoffWorker`'s existing fallback-safe pattern. Deployed as v137 (v136 was deployed first but
   contained a transcription mistake in two unrelated `_shared/app-base-url*.ts` files, caught and
   corrected via a byte-for-byte diff against the local repo copies before relying on it further).
2. Immediate recovery for job `85e00e30`: called `stall_bulk_document_job` directly via SQL
   (`auth.uid() IS NULL` is explicitly allowed by this RPC's gate — it only rejects a non-NULL
   caller who isn't staff, since it's designed to be called by the worker itself under
   service_role) to flip the job from `running` to `stalled`, purely so the frontend's Retry
   button becomes visible again. This does not itself resume the job — Carl still needs to click
   Retry, which runs under his own JWT and correctly re-invokes the worker via the launcher's
   already-`waitUntil`-protected `kickoffWorker`.

## Decisions

- Did not attempt to directly re-invoke the worker via SQL/`pg_net` to skip the manual Retry step
  — the worker's `x-worker-secret` value is a plain Deno env var, not stored in Vault or readable
  via SQL, so there was no way to construct a validly-authenticated direct call from this session
  without either exposing/rotating that secret (unnecessary risk for a one-off) or going through
  the UI's existing, correctly-`waitUntil`-protected Retry path.
- Confirmed via logs that this is unrelated to the system-account auto-refresh mechanism shipped
  earlier the same day (see `2026-08-19-bulk-generate-system-account-auto-refresh.md`) — that
  mechanism was working correctly throughout (`[graph-app-client] Token acquired` succeeding
  normally at and after the failure point); the recorded `jwt_near_expiry` stall in this job's
  `error_summary` predates that mechanism's deployment on an earlier stall of the same job.
- Did not add a retry-with-backoff loop around the self re-invoke fetch itself — the `waitUntil`
  fix directly addresses the observed failure mode (isolate torn down mid-flight), and the
  existing "eagerly release unfinished leases" behavior from the same-day counter/completion-fix
  entry already means a dropped chain link only costs the time until the next manual Retry, not
  lost work or mis-attributed `attempt_count`.

## Open questions parked

- No general-purpose "detect and recover a running job whose worker chain has gone quiet" cron
  exists yet — this class of failure (self re-invoke silently dropped) required a human noticing
  the job "doesn't seem to be generating anymore" and an ad-hoc investigation. Worth considering a
  cron check for `status='running'` jobs with no item `state` transitions in, say, the last 10
  minutes AND no `leased` items — but not built this session, since the direct fix (this bug
  shouldn't recur now) was the higher-priority action.
- No end-to-end confirmation yet that v137 actually prevents a future chain death — will only be
  proven by this exact job (or another large one) running to completion without a manual Retry.
