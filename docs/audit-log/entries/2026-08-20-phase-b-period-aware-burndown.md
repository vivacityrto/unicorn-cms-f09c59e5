# Audit: 2026-08-20 — Phase B: period-aware burn-down widgets

**Post-merge update (same day, PR #392):** the Overview tab's `PeriodSelector`
described below was reverted after several rounds of layout iteration with
Carl — badge text clipping, pill alignment/roundness/height mismatches
against the app's other toolbar controls, and finally the discovery that
"All time" and "Current period" showed identical numbers on this card
specifically (since this RPC's no-period default *is* the current window,
not a true unbounded sum) — not worth the friction for one card. The Time
tab's `PeriodSelector`/`BurndownCard` period-awareness, the
`rpc_get_package_usage()` migration, and the `PeriodSelector` colour fix all
shipped as described below and are unaffected. `rpc_get_package_usage()`'s
`p_renewal_period_id` param remains in place, unused by any caller for now,
available for a future Overview-tab UI that wants it without another
migration.

**Trigger:** planned follow-up (deferred Phase B from
`2026-08-20-package-renewal-period-windowing.md`), actioned same day at
Carl's request once Phase 1 and Phase 2 (entry-level tagging) had shipped.
**Scope:** `rpc_get_package_usage()` (adds an optional period param);
`ClientTimeSummaryCard.tsx` (Overview tab "Package Burn-down" card);
`ClientTimeTab.tsx`'s `PackageBurndownCards`/`BurndownCard` (Time tab).

## Findings
- Two separate "Package Burn-down" UIs exist and were both hard-coded to
  the package's *current* renewal window with no period concept: the
  Overview tab's card (backed by `rpc_get_package_usage()`, a DB function)
  and the Time tab's cards (backed by `v_package_burndown` plus a client-side
  allocation-aware monthly recompute already used for its existing
  "Show all / Current period" toggle).
- The Time tab's `BurndownCard` already recomputes monthly-level totals
  client-side from data it has in memory (`monthlyRows`/`allocByEntry`,
  fetched tenant-wide in the same query) - this made it possible to add
  period-awareness there with no new query at all, just parameterizing the
  existing window-filter logic that already powers "Show all".
- The Overview tab's card has no equivalent in-memory data to recompute
  from (it only ever fetches the current window from the DB), so its RPC
  needed an actual new parameter to serve a different window.

## Code changes (this entry accompanies)
- `supabase/migrations/20260820170000_rpc_get_package_usage_period_param.sql`:
  adds `p_renewal_period_id uuid DEFAULT NULL` to `rpc_get_package_usage()`.
  Arity changed (2 args -> 3), so `DROP FUNCTION` first, per this repo's
  documented 2026-08-14 incident with the same class of mistake - confirmed
  via `information_schema.routine_privileges` that no stray 2-arg overload
  survived and grants (`authenticated`, `service_role`; no `anon`) were
  identical before/after. When the new param is provided, the RPC reads that
  period's own frozen `period_start`/`period_end`/`included_minutes`/
  `carried_in_minutes` from `package_renewal_periods` directly instead of
  deriving the window from `package_instances`' *current* renewal dates.
  Default behaviour (param omitted) is unchanged - verified by replicating
  the RPC's inner queries manually against a real multi-period package
  instance before and after.
  Also added `carried_in_minutes` to the RPC's returned JSON (previously
  folded silently into `included_minutes`) - needed for a follow-up
  segmented-bar UI, piggy-backed onto this migration since it was already
  touching the function.
- `src/hooks/usePackageUsageQuery.tsx`: threads an optional `periodId`
  through `usePackageUsageDataQuery`/`usePackageUsageQuery`; the combined
  hook gains `selectedPeriodId`/`setSelectedPeriodId`, reset automatically
  whenever the selected package changes (a period selected for a different
  package doesn't mean anything).
- `src/components/client/ClientTimeSummaryCard.tsx`: adds a `PeriodSelector`
  next to the existing package dropdown on the Overview tab's Package
  Burn-down card. Resolves `PeriodSelector`'s `period_number`-based value to
  the actual `package_renewal_periods.id` uuid the RPC needs via a small
  local lookup query, rather than modifying the shared component's contract.
- `src/components/client/ClientTimeTab.tsx`: `PackageBurndownCards` gains
  `singleSelectedPackageId`/`selectedPeriodRow` props (the latter resolved
  the same way, in the parent `ClientTimeTab`); `BurndownCard` gains a
  `selectedPeriodOverride` prop that, when set, swaps its window/gauge
  numbers to the selected period's own totals (recomputed from the existing
  in-memory monthly data) instead of the always-current-year figures, and
  hides the "Show all" toggle (an explicit period pick already answers that
  question). Also added a `carriedInMinutes` field to each row, sourced from
  the open period per instance - same open-period lookup pattern already
  used by `RenewalHistorySection`.
- `src/components/client/PeriodSelector.tsx`: the shared trigger had no
  brand-colour styling (`border-primary text-primary`, matching every other
  toolbar filter's `Button variant="outline"` look) - caught visually after
  first wiring it into the Overview tab, since it was the first time this
  component was placed directly next to the app's standard cyan-bordered
  filter pills rather than alone. Fixed once in the shared component, fixing
  both tabs' appearance simultaneously.

## Decisions
- Overview tab: kept the existing package-selection dropdown as-is and
  added `PeriodSelector` alongside it, rather than trying to unify the two
  (package selection and period selection answer different questions).
- `TenantTimeSummaryStrip` (tenant-wide billable/non-billable strip)
  deliberately left all-time/all-tenant, not made period-aware - confirmed
  with Carl before implementation, since it answers a different question
  ("how much billed, ever/lately") than a single package's renewal cycle.
- A period row's `included_minutes` does not capture any `hours_added`
  top-up applied after that period closed (the period table only ever
  snapshotted the package's base included minutes + that period's own
  carry-in at renewal time) - known limitation, same shape as
  `period_number` not being a true lifetime count in the Phase 1 entry.

## Open questions parked
- None outstanding for this pass - the originally-deferred Phase B, Phase 2,
  and segmented carry-over bar items are now all either shipped or (for the
  segmented bar) ready to build as their own follow-up UI-only PR using the
  `carried_in_minutes` field this entry's migration already exposes.
