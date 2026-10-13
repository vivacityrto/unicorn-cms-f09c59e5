# Audit: 2026-10-13 — client-package-time-log-permissions

**Trigger:** drift-surfaced (Carl reported the client portal Packages page disagreeing with staff "View as client")
**Scope:** the three client-portal hours panels on the Packages page ("Where your hours went",
"Hours over time", "Recent work"), their backing views `v_client_package_hours_by_type`,
`v_client_package_hours_timeline`, `v_client_package_hours_recent`, and the RLS on
`public.time_entries`, `public.time_entry_allocations` and `public.package_instances`. Verified
read-only against the Unicorn production project (`yxkgdalkbrriasiyyrwk`). Did not change any RLS
policy, `get_client_package_dashboard`, `get_package_burndown`, or the staff-side time tools.

## Findings
- All three views are `security_invoker = true`, so they run as the caller. `time_entries_select`
  admits only the entry's author, Super Admins and Vivacity team
  (`user_id = auth.uid() OR is_super_admin_safe() OR is_vivacity_team_safe()`). A client user
  matches none of those, so a real client got **zero rows** from all three panels. Staff using
  "View as client" are Vivacity team, so they saw everything. That is the whole discrepancy.
- The package tiles (hours, stages, last activity) were unaffected because
  `get_client_package_dashboard` is `SECURITY DEFINER`. A real client therefore saw hours used on
  the tile with no breakdown, chart or time log explaining it.
- `v_client_package_hours_recent` had a second, separate drift from the other two panels: it
  windowed on `start_date` only (no renewal-cycle bounds, no allocation awareness, summed raw
  `duration_minutes`) and capped at the latest 10 entries. After 20260820180000 the by-type and
  timeline views were cycle- and allocation-aware but the recent list was not, so the list could
  not be reconciled to the totals even for staff.
- The three views were granted full table privileges (`INSERT/UPDATE/DELETE/TRUNCATE/...`) to both
  `anon` and `authenticated`. RLS made that inert for `anon`, but the grants were never
  intentional. Their only consumers are three hooks in `src/hooks`.
- Other `from('time_entries')` callers under `src/components/client/` (`ClientTimeTab`,
  `AddTimeDialog`, `EditTimeDialog`, `TimeLogDrawer`, `PackageTimeSection`, ...) are staff tools on
  the client record, not client-portal surfaces, so they are unaffected.
- The read-only Supabase MCP connection in the session points at the separate ComplyHub project
  (`gdwhlstfguxarnxasrrs`), which has none of these relations; it was not used for any finding
  here.

## KB changes shipped
- no changes

## Code changes (if this entry accompanies one)
- `supabase/migrations/20261013010000_client_package_hours_rpcs.sql`: adds
  `get_client_package_hours_by_type`, `get_client_package_hours_timeline` and
  `get_client_package_hours_recent` (`(p_tenant_id bigint, p_package_instance_id bigint)`).
  Each is `SECURITY DEFINER`, `search_path ''`, `row_security off`, and gated on
  `app.user_can_access_tenant(p_tenant_id)` plus `pi.tenant_id = p_tenant_id`, the same pattern as
  `get_client_package_dashboard` / `get_package_burndown` (20260911210000). EXECUTE revoked from
  `PUBLIC, anon`, granted to `authenticated`. Windowing and allocation logic copied verbatim from
  the 20260820180000 views. The recent RPC now returns every entry in the current renewal cycle,
  using the minutes credited to this package, so the list sums to the by-type total; non-billable
  entries stay (badged "Included") and `carry_over` is excluded. No `user_id` is returned.
  Revokes all privileges on the three views from `anon, authenticated`.
- `src/hooks/use-client-package-hours-{by-type,recent,timeline}.ts`: call the RPCs instead of the
  views. `src/integrations/supabase/types.ts`: the three function signatures added in the
  generated format. `PackageRecentWork.tsx`: heading is now "Time log · N entries" with
  "Show all N entries" / "Show fewer".
- `src/hooks/__tests__/use-client-package-hours.test.tsx`: 12 tests pinning that each hook calls
  the RPC with both ids, never `.from()`, surfaces errors, and stays idle without a tenant.
- Widening the `time_entries_select` policy to clients was rejected: it would expose every column
  (including `user_id` and internal fields) to clients for every consumer of the table, where the
  RPCs return client-facing columns only.

## Decisions
- Fix at the data-access layer with tenant-gated RPCs, not by loosening RLS.
- Migration validated with a dry run inside a transaction forced to roll back on the `unicorn-qa`
  project (functions compile, return types match, grants and revokes run, smoke calls execute;
  zero functions left behind afterwards). QA has no `time_entries` rows, so result values were not
  compared there.
- **Migration is written but not yet applied to production.** The frontend change depends on it,
  so apply the migration before the app deploys, then verify as a real client (not "View as
  client") that all three panels populate.

## Open questions parked
- The tiles read `package_instances.hours_used`, while the panels sum windowed time entries. They
  agreed for the package in the report (12:22) but are two sources; worth a periodic
  reconciliation check.
- Clients can see the free-text `notes` of each entry in the time log (as the old view already
  intended, cleaned by `cleanWorkNote`). If any notes are internal-only that needs a product
  decision, not a code fix.
- Nothing verified with a real client login: no seeded client credentials exist in this
  environment.
