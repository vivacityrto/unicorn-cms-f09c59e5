# Audit: 2026-08-19 — bulk-generate stall resilience + accurate diagnostics

**Trigger:** Carl noticed job `85e00e30-ac1f-472b-84f2-6040f6c1847f` had stalled again, showing
"Stalled — worker_self_reinvoke_lost: chain died after 03:00:18Z..." on the job page (a reason
that predated a fix already deployed that same day), and asked why. Follow-up: asked for a better
way to see a stalled job's real duration/activity than the raw "Duration" stat, since this job had
stalled more than once.
**Scope:** `bulk-generate-documents-worker` (self re-invoke resilience), new
`bulk-generate-documents-resume-stalled` edge function + cron, `stall_bulk_document_job` and
`reclaim_stale_bulk_document_locks` RPCs (accurate + accumulating stall reasons), one new read-only
RPC (`list_idle_running_bulk_document_jobs`), and `BulkDocumentJobProgress.tsx` (Last Activity tile
+ stall history popover). No RLS/trigger change.

## Findings

The reason text displayed on the job page (`worker_self_reinvoke_lost: chain died after
03:00:18Z...`) was accurate for the *first* stall but stale for the *second* — it was the literal
string manually passed to `stall_bulk_document_job` earlier that day (see
`2026-08-19-worker-self-reinvoke-waituntil.md`), and nothing had overwritten it since. The job had
in fact been retried (04:20:18 UTC, after the `EdgeRuntime.waitUntil` fix was already live as v137)
and made real progress, then stalled a *second* time — `error_summary.stalled_at` only reflected the
first incident because `reclaim_stale_bulk_document_locks`'s `running`→`stalled` transition (the
code path that actually caught this second stall, once 120 minutes of inactivity had passed) never
wrote a reason into `error_summary` at all; it only ever flipped `status`.

`function_logs` for the actual second-stall window (07:04–07:06 UTC) showed the chain had in fact
been healthy and self-perpetuating post-v137 — `START`/`END` pairs every ~55–70s, each processing
3–4 items — until the self re-invoke fetch at `07:06:09.330Z` got a real HTTP response back this
time (proof the `waitUntil` fix works: the response is no longer silently lost) of
`503 SUPABASE_EDGE_RUNTIME_SERVICE_DEGRADED`. Nothing after that point in the logs. This is the
*same* failure signature as the original 03:00 incident (also a 503 on this exact fetch, per that
entry's commit message) recurring hours later under the fixed code — conclusive evidence this is a
recurring transient condition on this Supabase project, not a one-off, and that "make the failure
observable" (the v137 fix) was necessary but not sufficient: a single rejected re-invoke was still
terminal, just no longer silent.

The previous entry's own "Open questions parked" anticipated both gaps closed here: it explicitly
flagged no cron existed to detect and recover a `running` job whose chain had gone quiet, and noted
"no end-to-end confirmation yet that v137 actually prevents a future chain death — will only be
proven by this exact job ... running to completion without a manual Retry." It didn't; this entry
is that proof, and the fix.

## Fix

1. **`stall_bulk_document_job`** and **`reclaim_stale_bulk_document_locks`**: both now write an
   accurate `stalled_reason`/`stalled_at` on every stall (the watchdog previously wrote neither),
   and both append to a new `error_summary->'stall_history'` jsonb array (`{reason, at, source}`,
   additive, never cleared) so a job that has stalled more than once shows every occurrence, not
   just whichever one last happened to overwrite the single field.
2. **Worker inline retry/backoff**: a rejected self re-invoke now retries up to 4 attempts total
   with backoff (1s/3s/6s) before giving up. If every attempt fails, the worker calls
   `stallAndRelease` immediately with an accurate `self_reinvoke_exhausted` reason, instead of
   leaving the job looking `running` for up to 120 minutes until the watchdog notices.
3. **`list_idle_running_bulk_document_jobs`** (new RPC) + **`bulk-generate-documents-resume-stalled`**
   (new edge function, cron-gated via the existing `_shared/cron-auth.ts` pattern) + a new
   `bulk-generate-resume-stalled` cron job (`*/2 * * * *`): finds `running` jobs with pending/leased
   items but no item activity in the last 3 minutes (comfortably above the worker's normal
   ~55–70s cadence, so a healthy chain never matches) and re-invokes the worker directly. This is a
   backstop independent of the worker's own retry logic — it catches anything that falls through
   even that, e.g. the whole `waitUntil`-tracked continuation never running at all.
4. **Frontend**: `BulkDocumentJobProgress.tsx` gained a "Last Activity" summary tile (most recent
   item-level activity, flagged red if a `running` job has had none in 3+ minutes — the same
   threshold the backstop cron uses) alongside the existing "Duration" tile (raw wall-clock since
   `started_at`, which conflates real processing time with idle/stalled gaps), and a "Stalled N×"
   popover next to the status pill listing every entry in `stall_history` when there's more than
   one, instead of only ever showing the single most recent reason.

## Decisions

- Chose a cron backstop over relying solely on inline retry/backoff: the inline retry only guards
  the ~10s window immediately after a batch finishes; a genuine platform outage lasting longer than
  that (or any failure mode that skips the retry loop entirely, e.g. the isolate torn down before
  the `waitUntil`-tracked continuation even starts) would otherwise still require a human notice.
  Both together: the inline retry handles a short blip in seconds, the cron backstop recovers
  anything else within ~2–4 minutes instead of up to 120.
- The new resume-stalled function re-invokes the worker using the same `x-caller-authorization` /
  `x-worker-secret` header shape as the launcher's `kickoffWorker` and the worker's own self
  re-invoke — `x-caller-authorization` only needs to be structurally present per the worker's
  documented auth model (never validated against Supabase Auth), so a synthesized
  `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` value is sufficient and avoids inventing a new credential
  path.
- Did not lower `reclaim_stale_bulk_document_locks`'s 120-minute stall threshold — it stays as the
  final, definitive "give up and require a human" backstop; the new 3-minute idle check is a
  separate, much more aggressive *resume* attempt that runs while the job still looks `running`,
  not a replacement for the slower path.
- Verified live: `list_idle_running_bulk_document_jobs(3)` correctly returns zero rows while job
  `85e00e30` sits `stalled` (excluded by the `status = 'running'` filter, as intended), and a manual
  `net.http_post` invocation of the new function returned `200 {"checked":0,"resumed":[]}`,
  confirming the cron auth headers, the function's gate, and the RPC call all work end-to-end.
  Did not retry job `85e00e30` itself as part of this session — that's a real action against a
  large (8,637-item) production job with real document generation/delivery side effects, left for
  Carl to trigger when he chooses.

## Open questions parked

- No live observation yet of the inline retry/backoff or the cron backstop actually recovering a
  *real* rejected re-invoke (would require another transient 503 to occur naturally, or job
  `85e00e30` — or another large job — running long enough to hit one). The auth/plumbing is
  verified end-to-end; the recovery behavior itself is unverified beyond code review.
- `stall_history` and the "Last Activity" tile are additive/informational only — nothing yet
  computes a true "cumulative active processing time" that excludes stalled gaps entirely (the
  "Duration" tile is still raw wall-clock since `started_at`). Parked as a nice-to-have, not
  pursued this session since "Last Activity" already answers the more urgent question (is this job
  actually still moving right now).
