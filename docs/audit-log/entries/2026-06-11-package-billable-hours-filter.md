# Audit: 2026-06-11 — package-billable-hours-filter

**Trigger:** ad-hoc — Dave reported that package burndown was counting non-billable
time entries against clients' hour banks. Confirmed: `is_billable` field exists on
`time_entries` (`NOT NULL DEFAULT true`, 0 NULL rows) but no package aggregation
surface filtered on it.
**Scope:** all views and the RPC that aggregate `time_entries.duration_minutes`
against packages. No table DDL, no RLS changes, no FK changes.

## Findings

- `get_client_package_dashboard` RPC (SECURITY DEFINER, `row_security=off`) — `hours_agg`
  CTE had no `is_billable` filter. Non-billable time was consuming clients' hour
  allocations and inflating burndown percentages.
- 11 additional views contained the same omission: `v_client_package_hours_timeline`,
  `v_client_package_hours_by_type`, `v_predictive_signal_inputs` (`burn_30d` CTE),
  `v_package_burndown`, `v_package_time_summary`, `v_dashboard_weekly_wins`,
  `v_dashboard_tenant_portfolio`, `v_admin_zero_progress_packages`,
  `v_client_package_dashboard` (legacy), `v_client_home_feed`. All were aggregating
  all time entries indiscriminately.
- `v_client_package_hours_recent` — intentionally left unfiltered (clients should see
  all activity including goodwill time); `is_billable` column added as trailing field
  so the frontend can badge non-billable entries as "Included".
- `v_dashboard_tenant_portfolio` had no `security_invoker` setting (unlike all other
  views); this was preserved exactly — no `WITH` clause emitted for that view.
- Live data confirmed real-world impact: package instance 15127 had 42.25 hrs of
  non-billable time counted against a client's allocation. Perth College (15164)
  had 400 min logged all non-billable — showing 6.67 hrs consumed when the correct
  billable count is 0.
- `package_instances.hours_used` stored column is NULL on 1,032 of 1,036 rows —
  effectively unused; `get_client_package_dashboard` computes hours live from
  `time_entries`. Noted as pre-existing debt, not touched.

## KB changes shipped

- No KB changes this session.

## Codebase observations

- unicorn @ `f70c1e42`: migration `20260611041127_406baea1-249b-4d64-b761-eda15019b222.sql`
  applied — 1 RPC + 11 views updated; `v_client_package_hours_recent` gains `is_billable`
  column; `src/hooks/use-client-package-hours-recent.ts` + `PackageRecentWork.tsx`
  updated to add "Included" badge for non-billable entries; `types.ts` regenerated.
- Post-deploy verification passed across all 5 queries:
  - `security_invoker=true` preserved on all 10 invoker views; absent on
    `v_dashboard_tenant_portfolio` as required
  - `is_billable = true` filter confirmed in all 10 target view definitions and RPC body
  - `is_billable` column present on `v_client_package_hours_recent`
  - Numeric sanity: packages with non-billable entries now show `billable_hours < all_hours`
    (e.g. package 15127: 1.25 billable vs 43.50 total)

## Decisions

- All surfaces fixed (client-facing and staff-facing) — user decision to keep the
  definition of "hours used" consistent platform-wide.
- `v_client_package_hours_recent` intentionally not filtered: clients see all activity
  (goodwill time shows value delivered), badged "Included" to distinguish from
  billable consumption.
- Frontend badge copy: "Included" (not "Goodwill" or "Non-billable").
- `package_instances.hours_used` stored column left as-is — orphaned, pre-existing debt.

## Open questions parked

- `package_instances.hours_used` (NULL on 1,032/1,036 rows) is used in
  `v_predictive_signal_inputs` `remaining_hours` calculation — results are effectively
  `hours_included + hours_added` for almost all packages since stored value is NULL.
  Worth a follow-up to either populate via trigger or remove the column.
- The "0 minutes" time entry feature Dave mentioned (allow logging 0-min entries as
  activity-only records) was deferred — separate ticket.

## Tag
audit-2026-06-11-package-billable-hours-filter
