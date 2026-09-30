# Audit: 2026-09-30 — package-usage-alerts-per-package

**Trigger:** ad-hoc (a consultant received a package-usage notification that looked
inaccurate for a client with more than one package)
**Scope:** the "membership utilisation" notification path: the two triggers on
`time_entries`, `compute_membership_usage()`, `membership_tier_capacity_config`,
`v_package_burndown` / `get_package_burndown` / `fn_package_used_minutes`, the
`hours_used` sync triggers, and `user_notifications`. Did not touch the Time tab UI,
the capacity-planning screens (see open questions) or any existing notification row.

## Findings
- Two separate row-level triggers on `time_entries` (`trg_check_membership_utilisation`,
  billable inserts only; `trg_check_membership_usage`, every insert) each called
  `compute_membership_usage(tenant)` and inserted a notification, so one event produced
  two notifications (`utilisation_critical` + `capacity_alert`, created in the same
  instant).
- `compute_membership_usage` was wrong for any client with more than one open package:
  - it picked ONE package per tenant (the tier package with the most annual hours) and
    ignored the others;
  - the numerator was ALL of the tenant's time entries since the window start — every
    package, billable or not — so hours on a second package counted against the
    membership;
  - the denominator came from a hard-coded tier table (`membership_tier_capacity_config`:
    Gold 14, Ruby 35, Sapphire 63, Diamond 98) rather than the client's own package. 40 of
    the 50 tenants with a tier package have a package whose own included minutes differ
    from the table (e.g. Sapphire 63 h in the table, 56 h on the package);
  - the "year" was the tenant's onboarding anniversary, not the package's own renewal
    period (one package's renewal was 7 days off the alert window, and an expired package
    instance was still open).
- Worked example (tenant 7545, alerted "90%" on 29 Sep 2026): two open packages. The alert
  computed 59.27 h / 63 h = 94.1 %. By the app's canonical per-package numbers the
  membership package had used 30.17 h of 56 h (~54 %) and the other package 29.10 h of a
  much larger allowance (~30 %) — neither was near 75 %.
- Alerts repeated monthly (`utilisation_<pct>_<tenant>_<YYYY-MM>` dedupe key) and said
  "approaching your limit" even for a tenant already at 174 %. Text was generic ("Client
  has used 90%") with no client, package or hours. 23 such notifications were sent in the
  last 120 days to 4 recipients, so the blast radius of changing it is small.
- The recipient was only `tenants.assigned_consultant_user_id`; an alert function error
  would have failed the time-entry insert (no exception guard).
- The app already has a canonical per-package calculation: `v_package_burndown`
  (allowance = `included_minutes + hours_added*60 + carried_in_minutes` of the open
  renewal period; used = billable minutes, allocation-aware, `work_type <> 'carry_over'`,
  within the package's own renewal window), kept in sync into `package_instances.hours_used`
  by `tg_recalc_package_hours_used` / `..._from_allocation`. The alerts did not use it.
- `time_entries.client_id` equalled `tenant_id` for every entry in the last 90 days, so
  the `NEW.client_id` vs `NEW.tenant_id` inconsistency between the two old triggers was
  latent, not an active bug.

## KB changes shipped
- no changes

## Code changes (if this entry accompanies one)
- Migration `20260930130000_package_usage_alerts_per_package.sql`:
  - adds `fn_package_usage_alert_trigger()` and `trg_package_usage_alert` (AFTER UPDATE OF
    `hours_used` ON `package_instances`, only when the value changes). It reads
    `v_package_burndown` for that one package, so the alert uses exactly the numbers the
    Time tab shows. Thresholds 75 / 90 / 100 (percent as displayed); only the highest
    threshold reached is sent; one notification per package per threshold per renewal
    period (`pkg_usage_<instance>_<threshold>_<period_start>`); recipient is the assigned
    consultant only;
  - skips packages with no allowance, unlimited packages (`is_unlimited_override`), paused
    packages, and tenants whose status is cancelled / disabled / archived / completed /
    inactive;
  - text names the client and package, gives hours used / included and the renewal date,
    and links to `/tenant/<id>?tab=packages&packageInstance=<id>`; reuses the existing
    types `utilisation_warning` (75) and `utilisation_critical` (90, 100), so no UI change;
  - wording at 100%: "Over included hours" / "Over by N hours|minutes" when actually over,
    "All included hours used" / "No hours remaining" when exactly at 100 %;
  - any error inside the function is caught and logged as a warning — it can never block
    a time entry;
  - revokes EXECUTE on the new SECURITY DEFINER function from PUBLIC/anon/authenticated;
  - drops `trg_check_membership_usage`, `trg_check_membership_utilisation`,
    `fn_check_membership_usage_alerts()` and `check_membership_utilisation_alerts()` (no
    other callers). `compute_membership_usage()` is left in place (still used by
    `rpc_get_membership_usage` / `rpc_get_consultant_clients`). No schema, RLS or grant
    change on any table; existing notifications untouched; idempotent.
- `supabase/migration-safety-allowlist.json`: one reviewed, expiring (2026-10-30) entry for
  two scanner false positives in this migration (the INSERT inside the function body and
  the words `AFTER UPDATE OF` in the trigger definition). The migration performs no
  migration-time DML.
- Dry-run on production inside a rolled-back transaction (repeated until clean), then
  verified nothing persisted: client with two packages produced 0 alerts (was 1 at 94 %);
  packages at 86.6 %, 137.4 % and exactly 100.0 % produced one correctly worded alert each;
  a package on a `completed` tenant was skipped; a repeat change produced no duplicate; an
  alert whose insert was forced to fail did not stop the underlying update; a real
  10-minute billable time entry flowed time entry -> allocation -> `hours_used` -> exactly
  one alert with no old-style duplicate; a 10-hour non-billable entry changed nothing.

## Decisions
- Decided by Carl (2026-09-30): alerts cover ALL packages with included hours (not just
  membership tiers); non-billable time does not count; recipient is the assigned consultant
  only (not the team leader); thresholds are 75 / 90 / 100 %.
- Usage and allowance come from the canonical burndown, not from a parallel tier-table
  calculation; the tier table is no longer consulted by alerts.
- Notification types were reused rather than adding new ones, to avoid UI and notification
  preference changes.

## Open questions parked
- **Catch-up alerts.** The trigger only fires when a package's `hours_used` next changes, so
  any package already at or above a threshold will send one alert for it the next time a
  billable entry lands on it (11 packages are at or above 75 % today, 4 already over 100 %).
  That is intended "once per period" behaviour but consultants will see a one-off burst.
- **Capacity-planning screens still use the old calculation.** `src/hooks/useCapacityEngine.tsx`
  calls `rpc_get_membership_usage` / `rpc_get_consultant_clients`, which use
  `compute_membership_usage()` and the tier table, so they likely show the same inflated
  percentages for multi-package clients. Out of scope here; needs its own change.
- **Tier table.** `membership_tier_capacity_config.annual_included_hours` disagrees with the
  package's own included minutes for 40 of 50 tier tenants. Decide whether the table should
  be retired or corrected once the capacity screens stop using it.
- **Parent/child packages.** `hours_used` rolls child instances up into the parent, while
  `v_package_burndown` does not; the alert uses the burndown number for the instance that
  changed. Confirm that is the wanted behaviour for parent packages.
- **Stale open packages.** Some package instances remain open long after `next_renewal_date`
  (e.g. renewal due 2025-09-17, still open). They no longer collect in-window usage, so they
  never alert, but they are data-quality noise.
- **CI migration scanner did not scan PR #1403.** The `audit-migrations` job reported
  "scanned 0 migration files" on #1403 although that PR added two migrations containing the
  same scanner-flagged shapes as this one. Worth checking how `--changed-only --base-ref`
  resolves the PR range in Actions, since the gate silently passed.
- Existing duplicate / inaccurate notifications already sent are left as they are.
