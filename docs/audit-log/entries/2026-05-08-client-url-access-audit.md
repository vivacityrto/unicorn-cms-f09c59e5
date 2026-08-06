# Audit: 2026-05-08 — client-url-access-audit

**Trigger:** ad-hoc — surfaced during investigation of "Open tasks" button routing clients to staff-side `/tasks` view
**Scope:** Full route inventory of `unicorn-cms-f09c59e5` — classify every route by protection level and determine which routes a client-role authenticated user can currently reach beyond their intended scope. Does not cover Supabase RLS policies (separate audit); does not cover unauthenticated access.

---

## Findings

### Protection architecture

`ProtectedRoute` has three layers:
1. Auth check — redirects unauthenticated users to `/login`.
2. `requireSuperAdmin` flag — redirects non-SuperAdmins to `/dashboard`.
3. RBAC route lists — `ADMIN_ROUTES`, `ADVANCED_ROUTES`, `EOS_ROUTES` in `useRBAC.tsx`. If a path is in the list, `canAccessAdmin()` / `canAccessAdvanced()` / `canAccessEOS()` is called. Clients have an empty permission set and fail all three checks → redirect `/dashboard`.

**Critical gap:** only routes explicitly listed in one of those three arrays get RBAC protection. Routes absent from all three lists receive only an auth check — any logged-in user, including clients with `unicorn_role = 'Admin'` or `'User'`, can navigate to them.

---

### Route classification — CLIENT REACHABLE, OUT OF SCOPE

The following routes have been confirmed navigable by a client-role authenticated user as at codebase SHA `d51d50b5`:

#### HIGH SEVERITY — staff-only content, no gate

| URL | Renders | Why unprotected |
|-----|---------|-----------------|
| `/admin/reviews` | `AdminReviews` — all tenant stage-release reviews | Not in ADMIN_ROUTES; no component-level role check |
| `/compliance-audits` | `ComplianceAuditGlobal` — all audits, all tenants | Not in any guard list; no role filter in component |
| `/tasks` | `TasksManagement` — staff task management | Not in any guard list |
| `/admin/sharepoint-folder-mapping` | SharePoint folder mapping UI | Not in ADMIN_ROUTES |
| `/admin/sharepoint-sites` | SharePoint sites admin | Not in ADMIN_ROUTES |
| `/admin/governance-documents` | Governance documents admin | Not in ADMIN_ROUTES |
| `/admin/ai-insights` | AI insights page | Not in ADMIN_ROUTES |
| `/manage-packages` | `ManagePackagesWrapper` — package admin | Not in ADMIN_ROUTES |
| `/admin/client-packages/:clientPackageId` | `ClientPackageDetailWrapper` | Not in ADMIN_ROUTES |
| `/admin/package/:id` | `AdminPackageDetailWrapper` | Not in ADMIN_ROUTES |
| `/admin/package/:id/tenant/:tenantId` | `AdminPackageTenantDetailWrapper` | Not in ADMIN_ROUTES |
| `/admin/package/:id/tenant/:tenantId/instance/:instanceId` | `AdminPackageTenantDetailWrapper` | Not in ADMIN_ROUTES |
| `/executive` | `ExecutiveDashboard` — executive summary view | Not in any guard list (sub-routes `/executive/financial-controls` etc. correctly require SuperAdmin, but the base route does not) |

#### MEDIUM SEVERITY — likely staff-only, no gate, content less sensitive

| URL | Renders | Why unprotected |
|-----|---------|-----------------|
| `/manage-categories` | `ManageCategoriesWrapper` | Not in ADMIN_ROUTES |
| `/manage-stages` | `ManageStagesWrapper` | Not in ADMIN_ROUTES |
| `/admin/manage-packages` | `PackageBuilder` | Not in ADMIN_ROUTES |
| `/admin/package-builder/:id` | `PackageBuilderDetail` | Not in ADMIN_ROUTES |
| `/membership-dashboard` | `MembershipDashboardWrapper` | Not in any guard list |
| `/rto-tips` | `RtoTipsWrapper` | Not in any guard list |
| `/team-settings` | `TeamSettingsWrapper` | Not in any guard list; no component role check found |
| `/package/:id` | `PackageDetail` | Not in any guard list |

#### DATA LEAK — query layer, not route layer

| Surface | Hook / Query | Leak |
|---------|-------------|------|
| Create Task modal assignee dropdown (client-visible) | `useVivacityTeamUsers` → `users` table, role-filtered client-side | Exposes `first_name`, `last_name`, `email`, `avatar_url`, `job_title` for all active staff to any authenticated user. No RLS policy blocks client-role users from this query. |
| "Open tasks" button on package dashboard (`PackageActionRow.tsx:41`) | UI routing only | Routes clients to `/tasks` (staff TasksManagement view) instead of a client task view. |

---

### Routes correctly protected — confirmed for reference

| URL | Protection |
|-----|-----------|
| `/manage-users`, `/manage-invites`, `/manage-tenants`, `/manage-documents`, `/admin/email-templates`, `/admin/team-users`, `/admin/tenant-users`, `/admin/user-audit` | ADMIN_ROUTES → `canAccessAdmin()` → clients blocked |
| `/eos/*`, `/processes/*`, `/client/eos` | EOS_ROUTES → Vivacity Team only |
| `/executive/financial-controls`, `/executive/client-commitments`, `/executive/decision-queue`, `/admin/team-users/new-starter` | `requireSuperAdmin = true` |
| `/client/*` | Isolated client layout — intended client scope |

---

## KB changes shipped

No changes — read-only audit session.

## Codebase observations (read-only)

- unicorn-cms-f09c59e5 @ `d51d50b5` (local HEAD, 1 commit behind `origin/HEAD` `c4b25fdd`): this is the state audited. The commit behind origin is unrelated to these findings (Added realtime notifier).

## Decisions

No ADRs drafted this session. Implementation will follow the Lovable production DB change workflow for any RLS changes; route guard additions are UI-only Lovable prompts.

## Open questions parked

- Does `ComplianceAuditGlobal` have any RLS protection at the data layer that would prevent a client from seeing other tenants' audits, even if the route is reachable? Not verified — needs a follow-up query-layer audit.
- Does `/executive` base route expose any real data or just a layout shell? Needs manual verification with a client account.
- `/team-settings` — is there a component-level role check that the file search missed? Low confidence finding — verify before fixing.
- `/package/:id` — is this route intentionally client-accessible (client viewing their own package detail)? Needs product clarification before adding a guard.

## Phase 2 — Implementation plan (to be executed separately)

The following Lovable prompts are needed. **RLS changes require the production DB change workflow; route guard changes are UI-only.**

### Group A — Route guards (UI-only Lovable prompts, no migration)

Add the following routes to `ADMIN_ROUTES` in `useRBAC.tsx`:
```
/admin/reviews
/admin/sharepoint-folder-mapping
/admin/sharepoint-sites
/admin/governance-documents
/admin/ai-insights
/manage-packages
/admin/client-packages/:clientPackageId   (use prefix match)
/admin/package/:id                         (use prefix match)
/manage-categories
/manage-stages
/admin/manage-packages
/admin/package-builder/:id
/membership-dashboard
/rto-tips
/executive
/team-settings
/tasks
```

Add `requireSuperAdmin` to `/admin/reviews` in `App.tsx` as a secondary belt-and-braces check.

### Group B — RLS / data layer (production DB change workflow)

1. Add explicit DENY policy on `users` table blocking `unicorn_role IN ('Admin', 'User')` from reading rows where `unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')`.
2. Alternatively: create a `vivacity_team_public` view (SECURITY DEFINER) exposing only `user_uuid`, `first_name`, `last_name`, `avatar_url` — no email or job_title — and update `useVivacityTeamUsers` to query the view.
3. Move the Create Task assignee query out of client-visible components entirely (gate `TaskAssigneeButton` / `StageStaffTasks` behind a staff-role check).

## Phase 3 — Cross-check results

**Phase 2A shipped:** unicorn-cms-f09c59e5 @ `fcb90a64` ("Applied RBAC default denies")

**Tested:** 2026-05-08, client-role user (`unicorn_role = 'User'` or `'Admin'`), browser navigation.

**Result: PASS** — all HIGH and MEDIUM severity routes from the audit now redirect to `/dashboard`. Client portal routes (`/client/*`, `/dashboard`, `/settings`) continue to render correctly.

**Phase 2A closed.** Route guard half of this audit is resolved.

**Phase 2B still open** — staff member enumeration via `useVivacityTeamUsers` (Create Task assignee dropdown leaking staff email + job_title to client users) has not been addressed. Requires a separate session following the Lovable production DB change workflow.

---

## Tag

`audit-2026-05-08-client-url-access-audit`
