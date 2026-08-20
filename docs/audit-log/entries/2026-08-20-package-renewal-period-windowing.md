# Audit: 2026-08-20 — package renewal period windowing

**Trigger:** drift-surfaced (Angela reported a renewed package still showing
over-100% hours used and stale "Stuck" status on the client portal)
**Scope:** the "Renew" action on a client package, the two "hrs used"
displays it feeds (staff package card, client portal dashboard), and the
carry-over mechanism in the same renewal dialog. Did not touch
`allocate_time_entry()`/`fn_reallocate_time_entry()` or add entry-level
period tagging - deliberately deferred, see "Open questions parked".

## Findings
- Clicking "Renew" (`src/components/client/RenewalConfirmDialog.tsx`) only
  ever bumped `package_instances.next_renewal_date`/`last_renewed_date` - it
  never reset hours, `stage_instances`, or `client_action_items`. No
  `renew_package` SQL function/trigger exists anywhere; the whole action is
  client-orchestrated JS.
- `fn_package_used_minutes()` (canonical calc behind
  `package_instances.hours_used`, trigger-maintained) summed billable
  minutes since the package instance's own `start_date` with no upper bound
  - a lifetime total, never re-anchored at renewal. `v_package_burndown`
    already did this correctly (windowed to the current renewal year via
    `next_renewal_date - 1 year`), which is why the Time tab burndown chart
    was accurate while the staff package card and client portal were not.
- `get_client_package_dashboard()` / `v_client_package_dashboard` had their
  own independent inline `hours_agg` calculation - not calling
  `fn_package_used_minutes()` at all. It carried both the lifetime-window
  bug AND a second bug `v_package_burndown` had already been fixed for on
  2026-07-30: it summed raw `time_entries.duration_minutes` directly,
  blind to `time_entry_allocations` splits/reallocations, understating
  usage for any RTO+CRICOS dual-scope client the same way described in
  `2026-07-30-package-burndown-view-fix.md`.
- Separately: `work_type = 'carry_over'` time entries are excluded from
  every usage calculation by design (accounting adjustment, not logged
  time) - but nothing ever credited that carried amount back onto the next
  period's allowance. "Carry Over" in the renewal dialog produced an audit
  note and a time-entry line item, with no actual effect on usable hours.
  Already flagged, unresolved, in
  `20260714071137_exclude_carry_over_from_used_minutes_calc.sql`'s comment:
  "flagged to Angela to decide whether these should instead credit
  hours_added." Decided in this session: yes, credit them.
- `package_instances.start_renewal_date` was found to already exist live in
  production (date, nullable, 0/1050 populated) with no migration file and
  no code reference anywhere in this checkout - added directly ahead of
  this work (per conversation with Carl, by Dave), as scaffolding for this
  exact fix.

## Code changes (this entry accompanies)
- `supabase/migrations/20260820120000_package_renewal_period_windowing.sql`:
  - Adds `package_renewal_periods` (one row per renewal cycle: period
    number, start/end date, included minutes, carried-in minutes, closed-at
    snapshot). RLS mirrors `package_instances`' actual write model (renewal
    already gated to `is_super_admin()` there).
  - Backfills one open period per existing package instance (1050/1050)
    using today's `(next_renewal_date - 1yr)` math - the last time
    anything trusts that derivation.
  - Rewrites `fn_package_used_minutes()` to window by
    `start_renewal_date -> next_renewal_date` instead of
    `start_date -> (unbounded)`. Structure (allocations-aware,
    parent/child rollup via the existing trigger) is otherwise unchanged.
  - Repoints `get_client_package_dashboard()`/`v_client_package_dashboard`
    at `package_instances.hours_used` directly instead of an independent
    recalculation, guaranteeing the portal always matches the staff figure
    exactly (same stored value) and inherits the allocations-awareness fix
    for free.
  - Adds carry-in credit (`package_renewal_periods.carried_in_minutes`) to
    `hours_total`/`included_minutes` in `v_package_burndown` and both
    dashboard queries.
- `src/components/client/RenewalConfirmDialog.tsx`: sets
  `start_renewal_date` explicitly to the renewal date just actioned (never
  derived by adding an interval to its own previous value - avoids the
  compounding drift that caused the Farsta incident); closes the current
  `package_renewal_periods` row and opens the next one, with a unique
  constraint on `(package_instance_id, period_start)` making a
  double-renewal-click a hard error instead of silent date corruption.

## Decisions
- Two-phase plan agreed with Angela/Dave: this entry is Phase 1 (fix the
  window bug at its one canonical source; add period-level, not
  entry-level, history). Phase 2 (entry-level period tagging on
  `time_entry_allocations`, for hour-by-hour historical drill-down) is
  explicitly deferred - it would require changing
  `allocate_time_entry()`/`fn_reallocate_time_entry()`, which already
  caused one production incident
  (`2026-08-07`-dated fix in `20260730020000_fix_package_burndown_view_allocations.sql`,
  a bulk reallocation on 2026-02-24 having mis-filed years of historical
  time). Deferred to its own dedicated, tested pass.
- Carry-over ceiling formula (`min(remaining_this_period, included_minutes
  of the current package)`) kept as-is - not changed to cap against an
  "original package at signup" figure, since that would require tracking a
  new permanent field and wasn't judged commercially necessary.

## Open questions parked
- Package renewal still does not reset `stage_instances` or
  `client_action_items` - the "Stuck"/overdue-task staleness Angela
  reported is still present post-fix (only the hours figure is corrected).
  Not part of the two decisions this session actioned; would need its own
  scoping conversation.
- `period_number` in `package_renewal_periods` counts periods recorded by
  this system from 2026-08-20 onward, not necessarily a client's true
  lifetime renewal count for instances that predate this migration -
  history before this date isn't recoverable (never stored).
- Phase 2 (entry-level tagging) remains open, see "Decisions" above.
