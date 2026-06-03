# Cohort Access Sender Worker — 4 Fixes

## Fix 1 — auth.uid() NULL in worker RPC context (BLOCKING)

**Migration** — `CREATE OR REPLACE FUNCTION` for all four, preserving existing bodies:

1. `lease_cohort_job_items` — add `p_caller_id uuid` param; replace `auth.uid()` in staff check with `p_caller_id`.
2. `record_cohort_item_outcome` — add `p_caller_id uuid` param; same swap.
3. `finalise_cohort_job` — add `p_caller_id uuid` param; change `v_caller uuid := auth.uid()` → `v_caller uuid := p_caller_id`.
4. `set_cohort_job_status` — add `p_caller_id uuid DEFAULT NULL`; staff check uses `COALESCE(p_caller_id, auth.uid())` so frontend callers still work.

I'll first read the current function bodies via `supabase--read_query` against `pg_proc` so the recreated functions are byte-accurate.

**Worker** — `supabase/functions/cohort-access-sender-worker/index.ts`: add `p_caller_id: caller.id` to all four RPC arg objects (including the `set_cohort_job_status` call in the TOO_MANY_FAILURES path).

## Fix 2 — `finalise_cohort_job` audit_eos_events NOT NULL crash

In the same migration, inside `finalise_cohort_job` change the INSERT to include `tenant_id` and select hardcoded `6372` (Vivacity) — matches the prior `launch_cohort_job` fix.

## Fix 3 — `payload` out of scope in worker

In the for-loop, hoist `let payload: any = undefined;` above the `try`, and change the inner `let payload: any = data;` to plain assignment `payload = data;`. No other behavior change.

## Fix 4 — Drain loop runs forever on worker abort

In `src/pages/admin/CohortAccessSenderJob.tsx`, after reading `remaining`/`status`, also read `aborted`. If truthy, show a destructive toast (`title: "Worker aborted", description: aborted`) and `break` the loop.

## Out of scope (do not touch)

`launch_cohort_job`, `resolve_cohort`, Preview recipients flow, `CohortAccessSender.tsx`, other edge functions.

## Order of execution

1. Read current SQL bodies of the four functions.
2. Submit migration (Fixes 1 + 2).
3. After migration approval, edit worker (Fixes 1 + 3) and `CohortAccessSenderJob.tsx` (Fix 4).
