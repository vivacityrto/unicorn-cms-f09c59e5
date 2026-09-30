# Audit: 2026-09-30 — capacity-planning-per-package-load

**Trigger:** follow-up to `2026-09-30-package-usage-alerts-per-package` (the same old
calculation fed the capacity-planning screens)
**Scope:** the Membership Dashboard "Consultant Capacity" table and its client drawer, the
client Overview "Membership year" line, `compute_client_weekly_required`,
`compute_consultant_current_load`, `rpc_get_consultant_capacity_overview`,
`rpc_get_consultant_clients`, `auto_assign_consultant`, `membership_tier_capacity_config`.
This entry covers only the first, database-only step (client weekly load); the drawer's
usage numbers and labels are listed under open questions.

## Findings
- A client's weekly consultant load (`compute_client_weekly_required`) counted ONE package:
  the open package with the highest weekly hours that appears in
  `membership_tier_capacity_config`. That table lists only nine V1 membership packages, so:
  - the V2 membership packages (M-DC-V2, M-DR-V2, M-SAR-V2) added zero load (5 clients);
  - Kick-Start, project and audit packages (KS-*, GC, CHC, ACC, FT-St ...) added zero load
    although they take real consultant time (7 more clients);
  - a client with two packages of the same tier was counted once (4 clients, about
    3.3 h/week hidden).
  In total 12 of 57 active clients with a consultant counted as zero load (17 including
  clients with no hours package at all).
- The same load drives `rpc_get_consultant_capacity_overview` (the table),
  `rpc_get_consultant_clients` (per-client hours in the drawer) and `auto_assign_consultant`
  (who gets each new client), so every one of them under-stated consultant load.
- The tier table's weekly hours are manual planning numbers, not derived from package
  hours: Gold 0.40, Ruby 0.91, Sapphire 1.55, Diamond 2.32 h/week against 14, 35, 63, 98
  annual included hours (ratios 1.23-1.49), so they are a planning assumption to be kept,
  not recomputed.
- Consultant capacity itself (working days x daily hours x 0.8 x 0.9) is consistent and
  unchanged.
- Client drawer (not changed here): the tier label comes from the legacy
  `tenants.package_id` (47 of 57 clients show "Unknown", the other 10 show a package that is
  not an open one); "% used" still comes from the tier-table calculation and is off by more
  than 10 points for 20 of 40 tier clients (3 shown under 75% are really at 90% or more).
- Client Overview card (not changed here): the "Membership year" line uses the onboarding
  anniversary, not the package's own renewal window.
- Parallel, unused structures exist (`tenant_tier_capacity_config` 345 rows, `vw_consultant_capacity`,
  `vw_consultant_load`, `vw_client_capacity_diagnostics`, `consultant_capacity_profiles`,
  `v_membership_combined_usage`, a second `useMembershipUsage` hook).
- Four open packages are children of another package (a project under a membership, a
  membership under a Kick-Start). They carry their own hours and time entries, so they are
  summed as separate service commitments.

## KB changes shipped
- no changes

## Code changes (if this entry accompanies one)
- Migration `20260930140000_package_capacity_config_and_client_load.sql`:
  - new table `public.package_capacity_config` (package_id PK -> packages, weekly_required_hours
    >= 0, source, notes, updated_at, updated_by). RLS mirrors `membership_tier_capacity_config`:
    Vivacity team can read, super admins can write; anon has no access; updated_at trigger;
  - seeded, every row recording its source, existing rows never overwritten on re-run:
    9 x `tier_table` (each tier package keeps its tier's existing hours), 9 x `copied_from_v1`
    (each V2 membership package copies its V1 package), 8 x `straight_line` (other packages
    with an open instance: `total_hours` spread over `duration_months`; ACC 1.08, CHC 0.13,
    FT-St 1.54, GC 0.13, KS-CRI 1.54, KS-GTO 1.54, KS-RTO 0.77, KS-RTO-V2 0.77 h/week);
  - `compute_client_weekly_required()` now sums planning hours across ALL of the tenant's
    open package instances (table first, then the same straight-line figure when a package has
    no row, so a newly sold package can never silently count as zero), then applies the
    unchanged onboarding multiplier (2.0x to day 28, 1.5x to day 56). Signature, SECURITY
    DEFINER and the active-tenant rule are unchanged, so all callers pick it up.
  - `membership_tier_capacity_config` and everything else are untouched.
- Dry-run on production inside a rolled-back transaction, then verified nothing persisted:
  - 26 rows seeded; re-running the seed added 0;
  - 57 active clients with a consultant: 19 changed, none went down, clients at zero load
    17 -> 6, total weekly load 42.25 -> 68.73 h (+63%);
  - consultant capacity screen (four consultants, anonymised), load as % of capacity
    before -> after: 24 -> 40, 31 -> 74, 54 -> 92, 64 -> 81; nobody over 100%.
- `supabase/migration-safety-allowlist.json`: one reviewed, expiring (2026-10-30) entry. The
  three INSERTs are a real idempotent seed of a brand-new table; the flagged UPDATE is the
  words `BEFORE UPDATE` in a trigger definition.

## Decisions
- Decided by Carl (2026-09-30): load comes from a planning-hours table keyed per package (not
  per tier); Kick-Start, project and audit packages count towards consultant load; ship the
  small database-only step first.
- Seed values are copies of existing planning numbers where they exist and a transparent
  straight-line default otherwise — no new numbers were invented. They are meant to be reviewed
  and edited by ops.
- The onboarding multiplier, consultant capacity formula and paused-package handling are
  deliberately unchanged.

## Open questions parked
- **Effect on assignments.** Total shown load rises 63% and one consultant moves to 92% of
  capacity, so `auto_assign_consultant` will steer new clients away from the busiest
  consultants sooner than before. That is the intended correction but worth watching.
- **Review the straight-line defaults** for Kick-Start and project packages (1.54 h/week for a
  40 h / 6 month package). Packages with no defined hours (KS-GTO-N, SK-EC) contribute 0.
- **No UI to edit `package_capacity_config`** yet; super admins can edit it with SQL only. An
  admin screen is the natural next step.
- **Paused packages** (2 on active clients) still count towards load, as before.
- **Phase 2 (not done):** client drawer should list each open package with its real usage from
  `v_package_burndown` and a correct label, and the client card's membership year should come
  from the package's renewal window; then `compute_membership_usage()` /
  `rpc_get_membership_usage` and the unused parallel structures can be retired.
- `membership_tier_capacity_config` hours still disagree with package hours for 40 of 50 tier
  clients; it is only read by `compute_membership_usage()` now.
