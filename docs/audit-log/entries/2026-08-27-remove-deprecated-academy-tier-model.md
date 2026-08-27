# Audit: 2026-08-27 — remove deprecated Academy Solo/Team/Elite tier model

**Trigger:** ad-hoc (Carl asked for an audit of "the old Vivacity Academy model — a tier plan or something that's already deprecated")
**Scope:** Every frontend trace of the `tenants.tenant_type` vertical-tier concept
(`academy_solo` / `academy_team` / `academy_elite`, Feb 2026) and its seat-limit/
self-service-upgrade UI. Did **not** touch the `tenant_type` enum, the DB
column, or any RLS/view definition that still references it — that's deferred
(see "Not done this session" below). Did not touch the separate, live
`academy_access_enabled` / `academy_max_users` entitlement system (managed via
`/superadmin/academy/tenant-access`), except to re-point one live consumer of
the shared `academy_max_users` column.

## Findings

- **Two unrelated Academy systems share the `tenants` table, and the codebase
  conflated them at first glance.** (1) The dead `tenant_type` vertical-tier
  model — `compliance_system` / `academy_solo` / `academy_team` /
  `academy_elite` — built Feb 2026 with a full self-service billing UI
  (seat caps, upgrade modal, plan cards). (2) The live `academy_access_enabled`
  boolean entitlement system, actively used and patched as recently as
  14 Aug 2026. Live query confirmed **all 415 production tenants** are
  `compliance_system` — zero have ever used an `academy_*` tier value, and no
  UI or edge function anywhere writes `tenant_type` to a non-default value.
  The route guards built for the tier model (`TenantTypeGuard`,
  `FeatureAccessGuard`) were never mounted anywhere in `App.tsx` — fully dead
  by both data and by absence of any writer or consumer.
- **`academy_max_users` is a shared, dual-purpose column** — already flagged
  as a known risk in `docs/audit-log/entries/2026-08-14-academy-parked-followups-resolved.md`.
  `useSeatLimits.ts`'s `checkSeatAvailability()` reads it as a whole-tenant
  invite cap (real, live — confirmed working against a real client tenant with
  a 5-seat cap during verification); the separate Academy entitlement system
  reads the same column as a course-enrolment cap. This session did not
  touch the column or its dual meaning — just kept `checkSeatAvailability`
  working exactly as before while removing the dead tier-branching around it.
- **`/academy/team` (`AcademyTeam.tsx`) turned out to be a half-built
  prototype, not a real feature** — surfaced mid-session and confirmed
  unfamiliar to Carl. Its "Members" table was hardcoded mock data (fake
  names, e.g. "Sarah Mitchell"), it had **zero navigation entry points**
  anywhere in the app (no `<Link>`, no `navigate()` call — grep-verified),
  and the sidebar "Team" nav item that would have pointed to it was
  permanently hidden by the same dead tier gate (`academyTier === "team" ||
  academyTier === "elite"`, always false). It did wrap two real, working
  pieces (`checkSeatAvailability`, `TenantInviteDialog`) inside the mock
  page. Removed entirely per Carl's direction once he saw it.
- **`ACADEMY_ONLY_ROUTES` in `navigationConfig.ts` looked like part of the
  same dead tier system (same file section, comment says "Routes that should
  be blocked based on tenant type") but is live** — used by
  `ProtectedRoute.tsx` for the real `hasAcademyOnly` access-scope redirect,
  unrelated to `tenant_type`. Caught by independently re-verifying every
  import site before deleting anything (per Carl's explicit reminder,
  following the PR #413/#416 `PackageDetail.tsx` incident where a component
  was declared dead from one route's absence without checking its other live
  importers). Left untouched, along with `COMPLIANCE_ONLY_ROUTES` and
  `academyFooterLinks` in the same file (confirmed zero importers for the
  former, and unrelated to the tier model for the latter — not part of this
  cleanup regardless).

## Code changes

Branch `hotfix/remove-deprecated-academy-tier-model`.

**Deleted (zero live importers, verified individually):**
- `src/components/guards/TenantTypeGuard.tsx`
- `src/components/guards/FeatureAccessGuard.tsx`
- `src/components/billing/FeatureAccessBlock.tsx`
- `src/components/billing/BillingStatusBanner.tsx`
- `src/components/billing/UpgradeModal.tsx` (always rendered `null` for any
  real tenant — `if (!nextPlan || isComplianceTenant) return null`)
- `src/pages/academy/AcademyTeam.tsx` + its route/lazy-import in `App.tsx` +
  title-map entries in `TopBar.tsx`/`AcademyTopBar.tsx`
- `src/components/academy/PlanInfoCard.tsx`, `src/components/academy/SeatLimitBanner.tsx`
  (orphaned once `AcademyTeam.tsx` was removed — re-verified zero other importers)

**Simplified (kept — real, live consumers remain):**
- `src/hooks/useBillingSignals.ts` — stripped to just `logUpgradeAttempt` +
  `UpgradeTriggerType` (live, called by `TenantInviteDialog.tsx` on a blocked
  seat-limit invite attempt); removed the dead `useBillingSignals()` hook and
  `checkFeatureAccess()` (zero callers).
- `src/hooks/useSeatLimits.ts` — stripped to `SEAT_LIMITS`, `UPGRADE_PATHS`,
  `checkSeatAvailability()` (all live, used by `TenantInviteDialog.tsx`);
  removed the dead `useSeatLimits()` hook and `PLAN_NAMES` (both zero
  remaining callers after the `PlanInfoCard`/`SeatLimitBanner` deletions).
- `src/components/client/TenantInviteDialog.tsx` — removed the
  `UpgradeModal` import/render and the "Upgrade to X" button in the
  seat-limit-reached alert (dead: `nextPlanName` is always `null` for
  `compliance_system`, the only real tenant type). The real seat-limit
  block/message and the `logUpgradeAttempt` audit call on a blocked attempt
  are unchanged.
- `src/components/layout/AcademyLayout.tsx` — removed the `academyTier`-gated
  "Team" nav section (always hidden — `academyTier` is `null` for every real
  tenant, so this was behaviour-preserving, not a visible change).
- `src/config/navigationConfig.ts` — removed `academyMenuSections` and
  `academyTeamSection` (dead duplicates of the nav `AcademyLayout.tsx`
  already builds inline; zero importers).

**Verification:**
- `npm run build` — clean, twice (once after the first pass, once after the
  `AcademyTeam.tsx` cascade).
- Grep sweep for every deleted symbol/file name across `src/` after each
  pass — zero dangling references.
- Playwright, live: `/academy/team` before removal (zero console errors,
  confirmed mock data + non-functional dialog for this session's tenant-less
  Super Admin profile); the real invite flow on a live client tenant
  (`/tenant/5?tab=users`, real "0 of 5 users" seat count from
  `checkSeatAvailability`) — `TenantInviteDialog` opens and renders cleanly
  with zero console errors after the `UpgradeModal` removal.

## Decisions

- Scoped strictly to the Solo/Team/Elite tier UI and its seat-limit upsell
  machinery — did not touch `TenantTypeContext.tsx`'s core `tenant_type`
  read, `isAcademyMember`/`isComplianceMember`/`AcademyTier` derivation, or
  the DB enum/column itself. That's a schema-adjacent change (enum values
  referenced in some RLS/view definitions per migration history) and belongs
  in its own session with the guardrail-required RPC/RLS sweep, not folded
  into a frontend dead-code pass.
- `/academy/team` removal was **not** pre-planned — it surfaced mid-audit as
  a related but distinct finding (a half-built prototype, not tier-model
  debris per se) and was removed only after Carl confirmed he didn't
  recognise the page and wanted it gone.
- Independently re-verified every deletion target's importers via fresh
  greps rather than trusting a single sub-agent's dead-code report, after
  that report's "zero importers" claim for `ACADEMY_ONLY_ROUTES` turned out
  to be wrong — it's live in `ProtectedRoute.tsx`, just for an unrelated
  feature. Caught before any file was touched.

## Not done this session (parked)

- **`tenant_type` enum / DB column.** Zero rows use the `academy_*` values,
  but the enum itself, `academy_max_users`, and `academy_subscription_expires_at`
  are untouched. Narrowing the enum requires sweeping RLS/view definitions
  that reference it (per migration grep) and updating this session's
  `checkSeatAvailability`/`SEAT_LIMITS` fallback logic in lockstep — a
  focused follow-up, not a frontend cleanup.
- **`academyTier`/`AcademyTier`/`isAcademyMember`/`isComplianceMember` in
  `TenantTypeContext.tsx`.** `academyTier` has zero remaining consumers after
  this session's `AcademyLayout.tsx` edit, but the context itself is
  untouched pending the DB-side decision above.

## Open questions parked

- Should `academy_max_users`'s dual meaning (whole-tenant invite cap vs.
  Academy-enrolment cap) be split into two columns? Flagged again here,
  originally flagged 14 Aug 2026 — still unresolved.
