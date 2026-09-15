# Audit: 2026-09-15 — Email-templates admin page gets its own scoped capability

**Trigger:** ad-hoc, RBAC v6 P1 follow-through on a decision already recorded in P1-e
**Scope:** `email_templates.manage` capability row (new), `ManageEmailTemplates.tsx`/`dashboardRoutes.tsx` gating; did not touch `admin.email_templates.manage` (left as `send-stage-email`'s own gate), RLS, or any other table

## Findings

- P1-e (2026-09-15) recorded Carl's decision to retire `admin.email_templates.manage` as the CRUD page's gate and model email-template admin access as its own row keyed to the actual RLS boundary, rather than continuing to borrow a feature key that's really `send-stage-email`'s downstream consumption gate. That decision had not yet been implemented.
- Investigated the real mismatch: `public.email_templates` RLS allows any internal Vivacity staff (`is_vivacity_internal = true` — currently BGT, CSC, Integrator, Super Admin, Team Member; Team Leader has the flag semantics but zero current users) to **read**, and only `is_super_admin_safe()` to **write**. The interim route-guard fix from earlier today (PR #1311) used `admin.email_templates.manage`, which only has a `role_permissions` row for Super Admin — so every other internal-staff role was blocked from even viewing the page, tighter than RLS actually requires.

## Code changes (this entry accompanies one)

- New `permission_features` row: `email_templates.manage` ("Email templates (CRUD page)"), distinct from `admin.email_templates.manage`.
- New `role_permissions` rows for `email_templates.manage`: Super Admin = `full`; Team Leader, Team Member, BGT, CSC, Integrator, CET = `limited`; no row for client-facing roles (consistent with every other internal-only key).
- `src/routes/dashboardRoutes.tsx`: `/admin/email-templates`'s `PermissionGate` now uses `email_templates.manage` (was `admin.email_templates.manage`).
- `src/pages/ManageEmailTemplates.tsx`: added `canEdit = usePermission('email_templates.manage', 'full')`, gating Create/Edit/Duplicate/Activate/Archive (hidden for `limited`-level viewers, who now see the table read-only with a "View only" label in the actions column instead).
- `admin.email_templates.manage` itself is untouched — still gates `send-stage-email` only.

## Decisions

- Net effect: Team Leader/Team Member/BGT/CSC/Integrator/CET gain view-only access to the templates page (matching RLS, which already permitted this); Super Admin's full access is unchanged; write actions remain Super-Admin-only everywhere (app layer and RLS).

## Verification

- `npm run typecheck` — clean.
- `LINT_RATCHET_BASE=origin/main npm run lint:ratchet` — 0 regressions (2 files checked).
- `npm run test:frontend` — 582 passed / 43 skipped, full suite green.
- Live Playwright (Super Admin persona, isolated dev server): page loads with full Create/Edit/Duplicate/Activate/Archive controls present, 0 console errors — confirms no regression to the existing full-access case.
- Negative case (a `limited`-level internal role seeing view-only, no action buttons) not live-verified — this repo has no seeded non-SuperAdmin staff test persona (documented gap, `AGENTS.md`'s Playwright harness section). Rests on the already-confirmed `role_permissions` data (queried live) and `usePermission`'s existing, already-tested level-comparison logic.
