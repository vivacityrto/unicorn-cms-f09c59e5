# Audit: 2026-08-20 — time_entry_allocations entry-level period tagging (Phase 2)

**Trigger:** planned follow-up (deferred Phase 2 from
`2026-08-20-package-renewal-period-windowing.md`), actioned same day at
Carl's request once Phase 1 + the Time tab reporting redesign (PRs #385-389)
had shipped and merged.
**Scope:** `time_entry_allocations` schema, `allocate_time_entry()`,
`fn_reallocate_time_entry()`. No frontend changes in this entry — purely
additive reporting metadata, no UI consumes it yet.

## Findings
- Confirmed by grepping every migration for `INSERT INTO
  time_entry_allocations` / `UPDATE time_entry_allocations`: exactly two
  functions ever write this table — `allocate_time_entry()` (full
  delete+rebuild) and `fn_reallocate_time_entry()` (three branches: package
  change, duration-only fast path, scope/multi-alloc fallback to
  `allocate_time_entry()`). No direct frontend writes (`src/` only ever
  `.select()`s from this table). This matches what was flagged as the reason
  Phase 2 was deferred in the Phase 1 entry — those two functions already
  caused one production incident on 2026-08-07 — so this pass treated both
  as sensitive and re-read their full latest definitions before touching
  either.
- While adding `renewal_period_id`, found `fn_reallocate_time_entry()` had a
  live gap independent of this feature: `EditTimeDialog.tsx` always
  resubmits `start_at`/`duration_minutes`/`package_instance_id` together on
  every save, but the trigger's branches only fired on `package_instance_id`
  or `duration_minutes` changing. A pure date-only edit (same package, same
  duration) matched none of the three branches and silently returned `NEW`
  untouched. Harmless before this change (nothing depended on `start_at`),
  but would have left `renewal_period_id` stale the moment it existed.
  Fixed as part of this migration, not a separate one — see below.

## Code changes (this entry accompanies)
- `supabase/migrations/20260820160000_time_entry_allocations_renewal_period_tagging.sql`:
  - Adds `time_entry_allocations.renewal_period_id uuid NULL REFERENCES
    package_renewal_periods(id) ON DELETE SET NULL` + index. Nullable, no
    CHECK/NOT NULL — reporting metadata only, never blocks a write.
  - Adds `fn_resolve_renewal_period_id(package_instance_id, entry_date)`
    helper (`STABLE SECURITY DEFINER`): `period_start <= entry_date <
    period_end` lookup against `package_renewal_periods`. Returns NULL
    (never raises) when no period covers the date.
  - `allocate_time_entry()`: same signature (uuid, uuid, text), so
    `CREATE OR REPLACE` used directly — no `DROP FUNCTION` needed (that
    pattern only applies when the argument list itself changes, per
    `AGENTS.md`). Every `INSERT` now also stamps `renewal_period_id`.
  - `fn_reallocate_time_entry()`: package-change branch and the
    duration-only fast path both now stamp/refresh `renewal_period_id`. The
    fast path's condition was broadened from "duration changed" to
    "duration **or** `start_at` changed" to close the `EditTimeDialog` gap
    above. Added a new final branch: a date-only change on a
    multi-allocation entry (only possible for `scope_tag = 'both'`
    membership-split entries) refreshes `renewal_period_id` on each existing
    row without touching `allocated_minutes` or the RTO/CRICOS split.
  - One-time best-effort backfill: `UPDATE ... FROM time_entries` joining on
    the same date-range rule, for all existing rows. Result: 987/1277
    (77%) of existing rows tagged; the remaining 290 are entries dated
    before the package instance's first tracked `package_renewal_periods`
    row (packages that have never renewed only got one period row spanning
    their current anniversary year, not their full lifetime — same
    documented limitation as `period_number` in the Phase 1 entry). Left
    NULL, not backfillable — no period row exists to point at.
- `supabase/migrations/20260820161000_revoke_anon_fn_resolve_renewal_period_id_execute.sql`
  (applied as a same-session follow-up, see "Findings" below): revokes
  `EXECUTE` on `fn_resolve_renewal_period_id` from `PUBLIC`/`anon`/
  `authenticated`, granting only `service_role`.

## Findings (security)
- `get_advisors(type: security)` immediately after applying the first
  migration flagged `fn_resolve_renewal_period_id` as callable by `anon` via
  `/rest/v1/rpc/fn_resolve_renewal_period_id` — Postgres grants `EXECUTE` to
  `PUBLIC` by default on `CREATE FUNCTION`, and PostgREST exposes any
  `SECURITY DEFINER` function with that grant as a public RPC endpoint
  regardless of intent. This is an internal helper only ever meant to be
  called from within `allocate_time_entry()`/`fn_reallocate_time_entry()`,
  never directly by a client. Fixed immediately in the same session using
  the exact precedent already established for this same class of issue
  (`20260817080000_revoke_anon_package_used_minutes_execute.sql` for
  `fn_package_used_minutes`) — revoke from `PUBLIC`/`anon`/`authenticated`,
  grant only to `service_role`. Confirmed the function owner still executes
  it fine when called internally from another `SECURITY DEFINER` function's
  body (verified via a live in-place duration/date-edit test, rolled back);
  the revoke only closes the direct external RPC path. Re-ran
  `get_advisors` after the fix — no longer flagged.

## Decisions
- Backfill historical rows now, not just tag going forward — confirmed with
  Carl before applying (non-destructive, additive-only column).
- Did not attempt to backfill the 290 pre-coverage rows by synthesizing a
  period further back than `package_renewal_periods` actually has data for —
  would require guessing/creating period rows never derived from real
  renewal history, which Phase 1 deliberately avoided doing.
- No UI wired to `renewal_period_id` in this entry — deferred to whichever
  future Time tab work wants entry-accurate period slicing instead of
  date-range filtering against `PeriodSelector`'s `dateFrom`/`dateTo`.

## Open questions parked
- None outstanding for this table/functions — Phase 2 as scoped in the
  Phase 1 entry is now complete.
