# P6-3 Packages/Time Characterization

> **Status:** characterization only — no extraction, no behavior change; one
> discovered discrepancy flagged for a decision before extracting
>
> **Parent plan:** [Codebase Optimization and KB Renewal Plan](../../codebase-optimization-plan-2026-08-28.md) — Phase 4, P6 hotspot slice #3
>
> **Program index:** [Program Index](../../program-index.md)
>
> **Prerequisite:** none — independent of slices #1/#2, taken in the P6 order

## Purpose and non-goals

This packet characterizes the tenant-instance package/time-tracking surface
(hours burn-down, renewal, time-entry allocation) before any extraction, per
the master plan's Phase 4 rule. It authorizes no code change, no schema/RLS
change, no RPC/trigger change.

**Two parallel workflows exist in the wider "packages" area; only one is in
scope here.** (A) the tenant-instance package/time surface — renewal,
hours burn-down, time-entry allocation — is the plan's named target
(filters/selection model equivalents: renewal-window calc, allocation
mutation, presentation model). (B) the package/stage **template builder**
(`PackageBuilder` → `StageBuilder`/`StageDetailPanel`) defines catalogue
structure, not renewal or hours, and is explicitly out of scope for this
packet.

## Surface inventory (workflow A — package/time)

| File | Lines | Role |
|---|---:|---|
| `src/components/client/ClientTimeTab.tsx` | 2,038 | Largest orchestrator: burn-down cards, monthly breakdown, renewal history, period selection, the (differently-named, unrelated) Reallocate dialog. Contains its own independent renewal-window calculation inside `PackageBurndownCards`. |
| `src/components/client/ClientPackagesTab.tsx` | 1,005 | Staff-facing package list/detail tab: renewal date display, finalise/end-date logic, package CRUD. |
| `src/components/client/AddTimeDialog.tsx` | 958 | Single-package time-entry creation; direct `time_entries` insert. |
| `src/hooks/useClientManagement.tsx` | 783 | Package-instance fetch/shape including `next_renewal_date`/`start_renewal_date`, maps `start_date` to the `ClientPackage.membership_started_at` prop name consumed elsewhere. |
| `src/components/client/EditTimeDialog.tsx` | 591 | Time-entry edit; the actual allocation-mutation surface (see below). |
| `src/components/client/RenewalConfirmDialog.tsx` | 455 | Renewal action: carry-in decision, mutates `package_instances`/`time_entries`. Contains its own independent renewal-window calculation. |
| `src/components/client/PackageUsageBar.tsx` | 45 | Pure presentation: segmented usage bar (used/included/carried-in), no side effects — already the target shape for a presentation-model seam. |

No Edge Functions front this surface; mutations go straight to Postgres
tables/RPCs (`package_instances`, `package_renewal_periods`, `time_entries`,
`time_entry_allocations`, `rpc_get_package_usage`).

## Seam 1 — renewal-window calculation: duplicated, with a real discrepancy

**This is the seam with prior incident history.** A "package renewal period"
class of bug was found and fixed independently at least 7 times across this
codebase in earlier sessions (frontend PRs #383, #389–#393, a client-portal
hours-views fix), and separately on the server side (see
`docs/audit-log/entries/2026-07-06-farsta-package-burndown-renewal-date.md`,
`docs/audit-log/entries/2026-08-20-*` — `fn_package_used_minutes`,
`rpc_get_package_usage`'s carry-in fix, the client-portal hours-views window
fix). The farsta incident's root cause was a **data** anomaly (one
`package_instances` row had a 730-day `next_renewal_date`/`start_date` gap
instead of 365), not a frontend code defect — but it's exactly the class of
bug a duplicated, independently-drifting window calculation makes easier to
reintroduce.

Two frontend implementations of the same "current renewal-year window"
concept exist today, both pure (given the row's own fields):

**`RenewalConfirmDialog.tsx:49–53`** (date-fns):
```
currentRenewal = next_renewal_date ?? addYears(membership_started_at, 1)
periodStart    = subYears(currentRenewal, 1)
newRenewalDate = addYears(currentRenewal, 1)
```

**`ClientTimeTab.tsx`'s `PackageBurndownCards`, lines 351–367** (raw `Date`):
```
renewalEnd   = next_renewal_date ?? new Date(start_date.year+1, start_date.month, start_date.day)
renewalStart = renewalEnd, then .setFullYear(year - 1)
```

Traced `membership_started_at` (used only by `RenewalConfirmDialog`/
`ClientPackagesTab`) to confirm it's the same underlying data as
`ClientTimeTab`'s raw `start_date` — `useClientManagement.tsx:733` maps
`membership_started_at: inst.start_date` when building the `ClientPackage`
shape. So both implementations operate on the same field, just via
different prop names depending on which shape the caller consumes.

**Discovered discrepancy, not yet resolved:** for a `start_date` of exactly
29 February (a leap day), the two implementations disagree on the
no-`next_renewal_date` fallback. date-fns's `addYears` (used by
`RenewalConfirmDialog`) clips 29 Feb → 28 Feb when the target year isn't a
leap year. JavaScript's native `Date.setFullYear` (used by `ClientTimeTab`)
rolls 29 Feb → 1 Mar instead. This is a real, if narrow, correctness
difference between the two duplicates — not hypothetical, and not something
either implementation's author appears to have deliberately chosen; it's an
artifact of using two different date libraries for the same calculation.
**This needs a decision (clip to 28 Feb, or roll to 1 Mar) before a shared
utility can be written**, since converging on either behavior silently
changes the other file's output for any tenant whose package started on a
leap day. Flagging rather than picking unilaterally, given this affects
real billing/hours-window boundaries.

`PeriodSelector.tsx` (119 lines) is the one place that avoids this class of
bug entirely — it reads `package_renewal_periods` rows directly rather than
recomputing the window, which is the pattern a shared utility should
generalize toward once the leap-day question is settled.

## Seam 2 — allocation mutation adapter: thin, not duplicated

Contrary to the renewal-window finding, the actual time-entry↔package
allocation mutation is **not** spread across many files:

- `EditTimeDialog.tsx:269–286` is the only write path that reassigns a
  `time_entries` row's `package_instance_id` — a single `.update()` call,
  no direct write to `time_entry_allocations`.
- All real splitting/reallocation across `time_entry_allocations` happens
  server-side, exclusively inside `allocate_time_entry()`/
  `fn_reallocate_time_entry()` (per
  `docs/audit-log/entries/2026-08-20-time-entry-allocations-renewal-period-tagging.md`,
  which states these are "the only two functions that ever write this
  table").
- `ClientTimeTab.tsx`'s "Reallocate" dialog (~lines 1154–1250) is a
  same-named but unrelated concept — it only updates `scope_tag`
  (Academy/Compliance/both), not package allocation. Do not conflate the
  two when scoping a future PR.

This seam is a small, well-bounded wrapper candidate (one `.update()` call
plus its guard conditions) once prioritized — lower risk than the
renewal-window seam, since there's no duplication to reconcile.

## Seam 3 — presentation model

`PackageUsageBar.tsx` is already a clean, side-effect-free presentation
component computing segment percentages from three numeric inputs — the
strongest existing example of the target shape in this feature area, and a
template for extracting the burn-down/renewal display math currently inline
in `ClientTimeTab.tsx`/`ClientPackagesTab.tsx`.

## Required characterization: real renewal example, carry-in, split allocations, boundary dates

- **Real renewal example / boundary dates:** the farsta incident (tenant
  7486, package instance 15101) is a real, documented boundary-date case —
  a 730-day gap instead of 365 pushed the RPC's window entirely past all
  logged time, zeroing the burn-down display. Any test suite for a shared
  utility should include this exact shape (a `next_renewal_date` far from
  `start_date + 1y`) as a fixture, plus the leap-day case above.
- **Carry-in:** `package_renewal_periods.carried_in_minutes` and
  `RenewalConfirmDialog`'s `cappedCarryOver` (`Math.max(0, Math.min(remaining, included))`)
  are the real carry-in semantics — carry-over is capped at the lesser of
  remaining and included minutes, never negative, never more than a full
  period's allocation.
- **Split allocations:** `time_entry_allocations` is where a single
  time-entry's minutes can be split across a renewal-period boundary or
  across packages; validate any extracted window function against real
  multi-instance data with allocations spanning a boundary, not just
  single-period fixtures.

## Existing test coverage

`src/test/packages/packageLifecycle.test.ts` (305 lines) covers lifecycle
*state* (`hours_used < hours_included`, completion equality) but has **zero**
assertions on renewal-window boundaries, carry-in, or allocation splitting.
No renewal/allocation test files exist anywhere in `src/test/` — this seam
has no existing oracle, matching the pattern found in slices #1/#2.

## Recommendation

Pure renewal-window calculation is the correct smallest first cut once the
leap-day discrepancy is resolved: it's pure (no I/O), has real prior
incident history in exactly this class of bug, and both frontend duplicates
can converge on one tested `src/features/packages/renewalWindow.ts`-style
utility taking `{ next_renewal_date, start_date }` and returning a typed
window — without touching the mutation or DB contracts. Required oracle:
focused unit tests per the characterization-oracle rule (oracle 1 — pure
function, no Supabase mocking needed), covering the farsta-shaped boundary
case, the leap-day case (once decided), and the normal case, before either
`RenewalConfirmDialog` or `ClientTimeTab` is migrated to call it.

The allocation-mutation adapter and presentation-model seams are lower-risk
follow-ups once this shared utility has coverage — they don't have the same
duplication-drift risk this one does.

## Definition of done for this packet

This characterization packet is complete once reviewed. The next step is
Carl's call on the leap-day fallback behavior (clip to 28 Feb vs. roll to
1 Mar) before any extraction PR is scoped — this is not authorized by this
packet.
