# Audit: 2026-06-11 — package-hours-rpc-trigger-fix

**Trigger:** ad-hoc — package burn-down widget still showed non-billable time in the
"Used" total after the previous billable-filter fix (the widget uses `rpc_get_package_usage`,
a separate RPC that was missed); and the package card showed "0.00 hrs used" despite
time entries existing (reading `package_instances.hours_used`, a stored column that
was never populated).
**Scope:** `rpc_get_package_usage` rewrite + function hardening; new trigger
`tg_recalc_package_hours_used` on `time_entries` maintaining `package_instances.hours_used`;
backfill of all 1,036 `package_instances` rows.

## Findings

- `rpc_get_package_usage` (latest migration `20260309112219`) — drives the Package
  Burn-down detail widget via `usePackageUsageDataQuery`. The `v_used_minutes` SELECT
  (lines 56–71) and `v_trailing_30d_minutes` SELECT (lines 73–88) summed ALL
  `duration_minutes` with no `is_billable` filter. By-source vars
  (`v_manual_total`, `v_timer_total`, `v_calendar_total` and 30d variants) were also
  unfiltered. `v_billable_total`/`v_non_billable_total` breakdown vars existed but were
  computed in the same filtered block — splitting them into a separate unfiltered SELECT
  was required to keep the breakdown badge accurate.
- Function had `SET search_path TO 'public'` (mutable, not hardened) and EXECUTE granted
  to PUBLIC.
- `package_instances.hours_used` — stored `numeric` column, NULL on 1,032/1,036 rows.
  No trigger ever maintained it. `useClientManagement.tsx:697` reads it directly:
  `hours_used: inst.hours_used || 0` → always showed 0.00 on the package card.
- No existing `package_instances` trigger fires on `hours_used` column changes — zero
  recursion risk confirmed pre-flight.
- `time_entries` has 7 existing triggers; none touches `hours_used`. Write volume is
  low (~1,062 rows total) — per-row trigger overhead negligible.
- 38 `time_entries` rows with NULL `package_instance_id` exist as pre-existing orphans;
  trigger silently skips them. Out of scope for this session.
- `te.package_id` (integer) vs `te.package_instance_id` (bigint FK) ambiguity in the
  RPC is a pre-existing quirk left intact. Trigger correctly uses `package_instance_id`.

## KB changes shipped

- No KB changes this session.

## Codebase observations

- unicorn @ `c89269fb` (origin/HEAD): migration
  `20260611054310_5798e873-c452-4e30-a8f5-95220a6b8329.sql` applied:
  1. `rpc_get_package_usage` rewritten — `v_used_minutes`, `v_trailing_30d_minutes` and
     all source breakdown vars filtered to `is_billable = true`; `v_billable_total` and
     `v_non_billable_total` moved to a separate unfiltered SELECT; `SET search_path TO ''`;
     `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO authenticated`.
  2. `public.tg_recalc_package_hours_used()` trigger function created — `SECURITY DEFINER
     SET search_path TO ''`, handles INSERT/UPDATE/DELETE, rolls child usage into parent,
     skips NULL `package_instance_id`.
  3. Trigger `trg_recalc_package_hours_used` created on `time_entries` — `AFTER INSERT OR
     DELETE OR UPDATE OF duration_minutes, is_billable, package_instance_id`.
  4. Backfill: all 1,036 `package_instances` rows populated; 70 with billable usage > 0,
     966 set to 0.
- Post-deploy verification passed (all 6 queries A–F):
  - RPC body: 3 occurrences of `is_billable = true`
  - `search_path=""` confirmed; `public` EXECUTE revoked, `authenticated` granted
  - `nulls = 0` on `package_instances.hours_used`
  - Mixed-billable sample: `hours_used = expected_billable_hours < all_hours` (e.g.
    package 14927: 15.50 billable / 36.50 total)
  - Trigger end-to-end on pi 15126: insert → +1.00 hr, unbill → revert, delete → revert
    (all within ROLLBACK — no data persisted)

## Decisions

- Source breakdowns (manual/timer/calendar) made billable-only for consistency with
  the Used total and the previous session's view fixes.
- Option A (trigger + backfill) chosen over Option B (inline subquery) — DB-enforced,
  no ongoing frontend concern, future consumers get correct data automatically.
- `v_billable_total`/`v_non_billable_total` kept in a separate unfiltered SELECT so the
  breakdown badge remains accurate.

## Open questions parked

- 38 `time_entries` rows with NULL `package_instance_id` — data hygiene follow-up,
  some may have a valid `package_id` (integer) but were never assigned the bigint FK.
- `te.package_id` (integer) vs `te.package_instance_id` (bigint FK) semantic ambiguity
  in the RPC — pre-existing quirk, tracked for a future cleanup session.
- `package_instances.hours_used` was read by test fixtures
  (`packageLifecycle.test.ts`, `package-test-data.ts`) which no longer need manual
  seeding of the field — test cleanup deferred.

## Tag
audit-2026-06-11-package-hours-rpc-trigger-fix
