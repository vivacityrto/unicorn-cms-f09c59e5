# Audit: 2026-11-18 — cst-live-requires-active-lifecycle

**Trigger:** Carl chose, from the open scorecard discussion items, that "Live Client" for the CST report and scorecard must also be lifecycle-active, so suspended and closed clients stop counting.
**Scope:** one migration replacing two internal functions in place (same signatures), plus the report's definition text, the metric dictionary and a static test.
**Status:** PR open. Not yet applied to production; applying needs Carl's explicit go-ahead.

## What changed

- `cst_activity_stats(timestamptz, timestamptz)` and `cst_last_activity()`: the "live" set now also requires `tenants.lifecycle_status = 'active'`. Everything else (client users, activity events, certificates, `SECURITY DEFINER`, empty `search_path`, service_role-only grants) is unchanged. `get_cst_report` and the weekly snapshot call `cst_activity_stats`, so both follow.
- Past weekly snapshots are not rewritten. Weeks snapshotted from the next run use the new rule, so the trend can step down once because four clients leave the cohort.
- "How these numbers are worked out" on the CST report now says suspended and closed clients are left out.
- Metric dictionary: Live Clients definition updated, the cohort question recorded as decided.

## Evidence

- Production, read-only (18 November 2026): 57 Live today; 53 once lifecycle active is required. The four dropped: Absolute Medical Response (status Active, lifecycle closed, likely a stale record), Adelaide Aviation and On The Mark Training (on hold, suspended), Positive Training Academy (in arrears, suspended).
- `unicorn-qa`, rolled back: the new function compiles, returns the same rows (QA has no suspended or closed Live clients), and only one overload exists afterwards.
- `supabase/functions/scorecard-refresh/cst-live-lifecycle.test.mjs`: both live sets carry the condition, no DROP, grants stay internal, rollback restores the earlier rule.

## Known limits and follow-ups

- The Manage Tenants "Live" filter is unchanged and still counts suspended and closed clients, so it will read 57 against this report's 53. Its CSC load chips already use lifecycle active.
- Absolute Medical Response's status should be checked by whoever owns client records.
- Rollback: `supabase/migrations/rollback/20261118110000_cst_live_requires_active_lifecycle.down.sql`.
