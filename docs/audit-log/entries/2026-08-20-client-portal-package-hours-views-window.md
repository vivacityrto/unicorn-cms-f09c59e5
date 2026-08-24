# Audit: 2026-08-20 — client-portal package hours views: lifetime → renewal-windowed

**Trigger:** Carl asked for a review of the client-portal Packages page
specifically for renewal correctness, after a screenshot of a real client
("Sapphire RTO Membership") showing the "Where your hours went" breakdown and
"Hours over time" chart alongside a headline "Hours 15:56 of 84:45" tile.
**Scope:** `v_client_package_hours_by_type`, `v_client_package_hours_timeline`
(views backing `src/hooks/use-client-package-hours-by-type.ts` and
`use-client-package-hours-timeline.ts`, rendered in
`src/components/client/package-dashboard/PackageHoursBreakdown.tsx` and
`PackageBurndownChart.tsx` on the client-portal Packages page,
`src/components/client/ClientPackagesPage.tsx`).

## Findings
- The headline "Hours X of Y" stat tile on this page is driven by
  `get_client_package_dashboard()`, already fixed earlier this session
  (`2026-08-20-package-renewal-period-windowing.md`) to read
  `package_instances.hours_used` (correctly renewal-windowed) directly.
- The two sections below it — the category breakdown and the cumulative
  timeline chart — were an **independent, unfixed** query path: both views
  filtered `time_entries` by `te.start_at >= pi.start_date` (package
  inception) with no upper bound and no reference to
  `start_renewal_date`/`next_renewal_date` at all. On a package several
  renewals into its life, both would sum/plot the client's entire history,
  not the current cycle — the same "lifetime instead of windowed" bug class
  already fixed in `fn_package_used_minutes()`, `v_package_burndown`, and
  `rpc_get_package_usage()`, just missed because these two views are
  client-portal-only and weren't part of the internal-staff-view sweep.
- A second, independent bug: both views summed raw
  `time_entries.duration_minutes` directly, blind to
  `time_entry_allocations` splits/reallocations — the same class of bug
  `v_package_burndown` was fixed for on 2026-07-30, understating/
  misattributing usage for any RTO+CRICOS dual-scope client.
- Verified against a real client (`M-SAR`/"Sapphire RTO Membership",
  `package_instances.id = 15101`, tenant 7486, renewed once,
  `start_renewal_date = 2026-06-13`): after the fix, the breakdown's two
  categories sum to exactly 15:56 (870 + 86 minutes), matching the
  already-correct headline tile figure to the minute. The timeline now
  starts at 2026-07-07 (after the renewal date), correctly excluding
  pre-renewal history.

## Code changes (this entry accompanies)
- `supabase/migrations/20260820180000_client_portal_hours_views_renewal_window.sql`:
  `CREATE OR REPLACE VIEW` for both views (output column list/types
  unchanged, so no `DROP VIEW` needed). Rewritten to match
  `v_package_burndown`'s exact pattern: a `UNION ALL` of (a) entries with an
  allocation row, credited to that allocation's own `package_instance_id`
  via `allocated_minutes`, and (b) entries with no allocation row at all,
  falling back to the entry's own `package_instance_id` + raw
  `duration_minutes`. Window is `start_renewal_date -> next_renewal_date`,
  falling back to `start_date -> start_date + 1yr` for any instance missing
  `start_renewal_date` (same fallback `v_package_burndown` uses). Explicit
  `WITH (security_invoker = true)` re-specified on both `CREATE OR REPLACE
  VIEW` statements — confirmed via `pg_class.reloptions` this was the
  existing setting (RLS on the underlying tables does the actual tenant
  scoping for this client-readable view) and isn't silently lost on
  replace.
- `get_advisors(security)` re-run after applying — no new findings for
  either view.

## Decisions
- Matched `v_package_burndown`'s full pattern (windowing + allocation
  awareness) rather than only fixing the windowing half, since leaving the
  allocation-blindness bug in place would have meant shipping a
  known-incomplete fix to the same views in the same session.
- Did not touch the headline stat tile's data source (`get_client_package_dashboard`)
  — already correct from earlier this session.

## Open questions parked
- None outstanding for this pair of views. Confirmed via grep that no other
  client-portal component reads `time_entries`/`package_instances` with a
  similar unwindowed pattern, but a broader sweep of every client-facing
  view wasn't performed — worth another pass if further client-reported
  discrepancies surface.
