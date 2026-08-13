# Audit: 2026-08-14 — CSC and Integrator granted full parity with Team Leader on Academy Builder

**Trigger:** ad-hoc (Carl asked for CSC and Integrator to have access to the Academy pages)
**Scope:** the `/superadmin/academy/*` + `/superadmin/workforce-pdp` admin section
("Academy Builder" in the sidebar) and the `role_permissions` rows that gate
actions within it. Did not touch the learner-facing `/academy/*` pages
(courses, certificates, events, community, team, PDP) — those were already
open to all Vivacity staff via `workMenuItems`/`ProtectedRoute`, no gap there.

## Findings

- The sidebar already claimed Team Leader and (partially) Integrator could see
  the Academy Builder section (`src/components/DashboardLayout.tsx`), but
  every one of its 11 routes was wired to `<ProtectedRoute requireSuperAdmin>`
  in `src/App.tsx` — a hard block on anyone whose `unicorn_role` isn't
  literally `'Super Admin'`. Team Leader and Integrator would have been
  bounced to `/dashboard` on click, regardless of the sidebar. This was
  latent/undetected because zero `users` rows currently have
  `unicorn_role = 'Team Leader'` in production.
- Separately, a real `role_permissions` table already exists and is the
  intended fine-grained authority for what a role can do inside these pages
  (view vs. create/edit/publish/manage, via `usePermission()`), with an
  in-app editor at `/administration/role-permissions`. Its `academy.*` rows
  already gave CSC and Integrator `full` on the view-only keys
  (`academy.builder.view`, `academy.certificates.view`,
  `academy.enrolments.view`, plus Integrator on `academy.mapping.view`) but
  `none` on every mutating key (`.edit`, `.publish`, `.issue`, `.create`,
  `.revoke`, `.manage`) — so even with the route fixed, CSC/Integrator would
  only have gotten read-only access, not the requested parity with Team
  Leader.
- `AcademyPackageCourseRulesPage`, `AcademyTagManagementPage`, and
  `/superadmin/workforce-pdp` have no per-role granularity at all in
  `role_permissions` (Tag Management and Workforce PDP have no `academy.*`
  rows targeting them) — access there is controlled solely by the route
  guard.

## Code changes (this entry accompanies one)

- `97270be4`:
- `src/components/ProtectedRoute.tsx`: added an `allowedRoles?: string[]` prop
  (checked against `profile.unicorn_role`, SuperAdmin always passes) alongside
  the existing `requireSuperAdmin` boolean.
- `src/App.tsx`: the 11 `/superadmin/academy/*` + `/superadmin/workforce-pdp`
  routes now use `allowedRoles={ACADEMY_BUILDER_ROLES}`
  (`["Team Leader", "Integrator", "CSC"]`) instead of `requireSuperAdmin`.
- `src/components/DashboardLayout.tsx`: the Academy Builder sidebar section
  now shows in full (no more per-item filtering hiding items from Integrator)
  for Super Admin, Team Leader, Integrator, and the newly-added CSC.

## Data backfill (this entry accompanies one)

Ran a direct `UPDATE role_permissions SET level = 'full'` (via
`execute_sql`, confirmed with Carl beforehand) for `role IN ('CSC',
'Integrator')` across all 11 existing `academy.*` feature keys
(`academy.builder.edit/publish/view`, `academy.certificates.issue/view`,
`academy.enrolments.create/revoke/view`, `academy.mapping.edit/view`,
`academy.tenant_access.manage`) — 14 rows changed from `none` to `full`
(the view-only keys already at `full` were untouched). Verified post-hoc that
CSC, Integrator, and Team Leader now read identically across every
`academy.*` feature key.

## Decisions

- Chose full parity with Team Leader (Carl's explicit choice among four
  options presented) over the narrower "just extend Integrator's existing
  `Package → Course Rules` subset to CSC" option — CSC and Integrator now have
  the same create/edit/publish/manage capability as Team Leader everywhere in
  Academy Builder, not just view access.
- Left BGT and CET untouched — not requested, and their existing `academy.*`
  permission rows were not part of this change.

## Open questions parked

- Team Leader has zero real accounts in production today, so this fix's
  correctness for Team Leader itself is unverified against a real login —
  only inferred from the route/permission logic and the CSC/Integrator
  accounts that do exist.
