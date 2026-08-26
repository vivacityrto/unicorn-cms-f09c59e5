# RBAC v6 — Gate Closure & Industry-Standard Alignment Plan

> **Last updated:** 2026-08-26 (added route-classification and regression lessons from the remediation audit) · **Reconsider by:** 2026-09-30 · **Confidence:** high on the findings below (grounded in live DB queries + source reads on 2026-07-31, 2026-08-25, and the remediation audit on 2026-08-26); low on effort/sizing estimates — no line-by-line codebase audit has been done yet (see "Investigation required before implementation").
>
> **Status:** Planning only. No code or DB changes made. Triggered by a real access request (AJ Delostrico, CSC role, needs package/stage/academy-admin access) that turned out to be blocked by an architectural gap, not a missing permission row.
>
> **Supersedes nothing. Extends:** [`rbac-v5-implementation-plan.md`](rbac-v5-implementation-plan.md) (all 8 phases shipped 10 June 2026 — that doc's own status header still says "In planning", which is stale; see correction note in that file).

---

## Why this exists

A session on 2026-07-31 tried to solve a narrow problem — give one CSC-role staff member (AJ) access to package/stage management and the Vivacity Academy admin console, without over-provisioning them to Super Admin. That investigation surfaced that Unicorn 2.0 already has most of the machinery the industry considers best practice for this (see "What's already right" below) — but a specific piece was never connected, and that piece is exactly what blocks AJ's case. This doc plans closing that gap plus the other gaps found alongside it, not rebuilding RBAC from scratch.

## Industry context (from research done the same session)

- **Supabase's own documented pattern** ([Custom Claims & RBAC](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac)) is: role/permission tables (not an inline-checked enum), a JWT custom-claims hook, and RLS policies that all call one `SECURITY DEFINER` `authorize()`-style function instead of embedding role logic per-policy.
- **Per-user exceptions on top of role defaults** aren't one universally-named pattern, but every source (Cerbos, Oso, OWASP) converges on the same shape: role gives defaults, something layered on top (an override table, or — as here — the ability to hold an additional role) grants the exception as a **data change**, not a code change.
- **React best practice** (CASL et al.) converges on one ability/permission hook used everywhere, never ad-hoc `role === 'X'` checks scattered through components.
- Full source list: see the research summary already in this session's transcript (Supabase docs, Cerbos, Oso, OWASP Authorization Cheat Sheet).

## What's already right (do not redo)

RBAC v5 (see [`rbac-v5-implementation-plan.md`](rbac-v5-implementation-plan.md), all phases marked done) already built most of the industry-recommended shape:

| Piece | Status | Where |
|---|---|---|
| Normalized permission tables (`permission_features`, `role_permissions`, `permission_change_log`) | ✅ Live | Confirmed via live query 2026-07-31 — 27+ feature rows across Administration/Academy/Packages/Documents modules |
| Per-user exception mechanism (`user_roles` junction table — hold an additional role beyond primary) | ✅ Live, exactly matches the industry "override on top of role defaults" pattern | `user_roles` table, consumed by `usePermission()` |
| Single server-side gate function (`check_permission`) | ✅ Live | Used by edge functions per v5 Phase 2.2 |
| Single client-side hook (`usePermission(featureKey, minLevel)`) | ✅ Live | `src/hooks/usePermission.ts` |
| No-code admin UI to grant/change permissions, with change log | ✅ Live | `/administration/role-permissions` → `RolePermissionsEditor.tsx` |
| Dynamic role registry (`dd_unicorn_roles`) — adding a role is an INSERT, not a migration | ✅ Live | Confirmed in v5 doc + live query |

This is a genuinely good foundation. The problem is coverage, not design.

## Confirmed gaps (live-verified 2026-07-31)

**1. Route-level access does not go through the permission system at all.**
`ProtectedRoute` (`src/components/ProtectedRoute.tsx:130`) has a `requireSuperAdmin` boolean prop that checks only `is_super_admin` — it never calls `usePermission`/`check_permission`. Per [`codebase-state/route-inventory-by-role.md`](../codebase-state/route-inventory-by-role.md) (dated 2026-07-29), 47 routes are hard-gated this way, including package builder (`/admin/manage-packages`, `/admin/package-builder/:id`), stage builder/analytics (`/admin/stages`, `/admin/stage-builder`, `/admin/stage-analytics`), and every `/superadmin/academy/*` route. Granting a role or an additional `user_roles` row `full` permission on `packages.*`/`academy.*` features has **no effect** on these routes — they're blocked before the permission table is ever consulted. This is the exact blocker hit trying to solve AJ's case.

**2. Stage management was never modeled into the permission system.**
Live query against `permission_features` for `feature_key ilike '%stage%'` returned zero rows. The v5 seed (64 features) covers Administration, Clients, Packages, EOS, Academy, Audits, Resource Hub — no Stages module. `StageBuilder.tsx` gates on a raw `isSuperAdmin` check (`src/pages/StageBuilder.tsx:72,327`), confirming it was never brought into the v5 model at all, not even at the in-page level.

**3. An unknown number of frontend files still bypass the permission hook.**
A grep this session for `isSuperAdmin()`/`unicorn_role === `/`global_role === ` raw checks (excluding the hook definitions themselves) returned 71 files. V5 Phase 8 only wired Academy, Resource Hub, EOS, Clients, and Packages modules to `usePermission`; Administration pages, Stage Builder, and others were out of scope. No full census of which of the 71 are legitimately fine (e.g. checks that should stay boolean, like the disabled-account check) versus which are permission gates that should be migrated.

**4. RLS is not routed through `check_permission` — it's still coarse, and some of it is still inline.**
V5 Phase 4.3 replaced 9 specific `is_vivacity_*` helper functions' hardcoded role lists with a single `is_vivacity_internal` boolean check — this fixed "adding a role breaks RLS" but did **not** make table-level RLS granular per feature. One inline example confirmed this session: migration `20260420035212_...sql` (lines 116-119) has `unicorn_role IN ('Super Admin','Team Leader','Team Member')` written directly into a function body, not delegating to a shared helper. Whether this is one isolated case or a widespread pattern across the ~1,364 migration files has **not** been assessed.

**5. No JWT custom claims — permission checks are a live round-trip, not a token read.**
`usePermission` does two separate Supabase queries (`role_permissions`, `user_roles`) per session, cached 5 minutes client-side (react-query `staleTime`). This was already flagged as a known gap in v5's own "Open questions" (never actioned). Supabase's recommended pattern reads role from the JWT via the Custom Access Token Hook instead. Adopting it would need to be weighed against the up-to-1-hour claim-staleness trade-off industry sources note.

**6. "Is this a real staff member" is a repeated, uncentralized WHERE clause, not a single source of truth — confirmed live 2026-08-25.**
Every staff-facing listing surface (team directory pickers, meeting attendee auto-seeding, consultant/auditor/KPI-staff selectors) independently repeats some subset of `is_vivacity_internal = true AND archived = false AND disabled = false AND kpi_pod <> 'qa'` inline, in both Postgres functions (`get_vivacity_team_directory`, `get_vivacity_team_directory_staff`, `seed_meeting_attendees_from_roles`, `sync_l10_meeting_participants`, and others not yet audited) and ~9 frontend files querying `public.users` directly (`useAuditWorkspace.ts`, `KpiStaffSelector.tsx`, `ReassignConsultantDialog.tsx`, `NewAuditModal.tsx`, `ClientMessagesTab.tsx`, three Academy facilitator pickers, `StaffEngagementDetail.tsx`). This is the same "logic duplicated instead of centralized" problem the rest of this doc identifies for permissions generally, just for "is this a listable human" instead of "can this user do X":
  - **Real incident that surfaced it:** a dedicated non-human service account (`bulk-generate-automation@vivacity.com.au`, created per `docs/audit-log/entries/2026-08-19-bulk-generate-system-account-auto-refresh.md` — needs `is_vivacity_internal = true` to pass staff-only RPC gates like `is_vivacity_team_safe`) was silently appearing in L10 meeting attendance and every staff picker, because none of the ~13 duplicated WHERE-clause sites excluded it. Fixed reactively (`supabase/migrations/20260825070000_hide_system_accounts_from_staff_lists.sql` — added a `users.is_system_account` boolean, patched all 13 known sites, deleted the bad attendee rows already seeded), but the fix is itself an instance of the anti-pattern: a 14th flag bolted onto a query shape that isn't owned anywhere.
  - **Why this belongs in v6, not as a one-off:** the same gap will recur for the next exclusion someone needs (a future QA/test/demo account, a contractor who should show in some lists but not others, etc.) unless "is this user eligible to appear in a staff listing" becomes one owned definition instead of N copies. This is a narrower, cheaper version of the "route-level access does not go through the permission system" problem (#1 above) — same shape (logic re-derived per call site instead of delegated to one gate), smaller blast radius (visibility, not authorization).
  - **Proposed shape (not yet built, sizing not done):** a single Postgres view (e.g. `public.staff_directory` or `public.listable_staff`) encapsulating `is_vivacity_internal = true AND COALESCE(archived,false)=false AND COALESCE(disabled,false)=false AND COALESCE(is_system_account,false)=false AND COALESCE(kpi_pod,'')<>'qa'`, with every current call site (functions and frontend queries alike) migrated to select from the view instead of repeating the predicate. A frontend equivalent (a single `useListableStaff()` hook, mirroring the `usePermission()` pattern this doc already recommends generalizing) would close the client-side half. Whether this becomes its own v6 phase or folds into Phase 3 (RLS consolidation, since it's the same "stop inlining the same predicate everywhere" instinct) is a sequencing decision for whoever scopes Phase 0 next, not decided here.

## Remediation-audit lessons to carry into v6 (2026-08-26)

The targeted remediation audit found a route-classification drift: `ProtectedRoute` treated client access as an explicit allowlist, while the reusable `canAccessRoute()` helper initially defaulted to allowing paths it did not recognise. The live guard was already the safer implementation; the helper was corrected to match it. This is not a reason to replace the v6 design. It is concrete evidence for the following implementation constraints.

1. **Classify client routes allowlist-first and fail closed.** A non-staff user may access only a deliberately registered client route or route prefix. An unknown, newly added, renamed, or internal route must resolve to denied access for client roles; hiding a navigation item is not a substitute for this check.
2. **Keep route guards, permission checks, and data authorization distinct.** `ProtectedRoute`/`useRBAC` improve the browser experience and prevent accidental deep-link access, while `usePermission` controls feature visibility and workflow affordances. Neither is an authorization boundary for Supabase data or Edge Functions: RLS and server-side permission checks must independently authorize the requested tenant, resource, and action.
3. **Give route classification one owner.** Phase 0 should derive the canonical route inventory from `src/App.tsx`, then make both `ProtectedRoute` and `canAccessRoute()` consume or verify against that inventory. Do not maintain two hand-edited lists that can silently diverge. Each route must be explicitly marked as public, client-portal, internal permission-gated, or hard-SuperAdmin.
4. **Test deep links, not just menus.** The v6 regression suite should cover direct navigation and browser refresh for every client-portal prefix, representative staff permission routes, hard-SuperAdmin routes, and an unrecognised path. At minimum, client Admin and client User must be denied an internal route and allowed every route deliberately assigned to them; staff/SuperAdmin outcomes must match the route's declared classification.
5. **Make role predicates explicit and canonical.** New server-side gates must not treat a non-empty role string as proof of staff authorization. They should use the established caller/profile helpers and explicit role or permission predicates, so new role labels cannot acquire authority by accident.

These are acceptance criteria for Phases 0–4, not a claim that frontend checks alone close the database/Edge Function authorization gaps. The detailed evidence is recorded in [`../../audit-report-2026-08-26.md`](../../audit-report-2026-08-26.md).

## Investigation required before implementation

None of the following has been done yet — this plan intentionally stops short of it per this session's brief. Each must happen before its corresponding phase below is scoped into actual prompts/migrations:

- Full census of the 71 raw role-check files: which are permission gates (migrate to `usePermission`) vs. legitimate boolean checks (leave alone — e.g. disabled-account, loading states).
- Full list of the 47 `requireSuperAdmin` routes cross-referenced against which already have a corresponding `permission_features` row (some may — need row-by-row mapping before deciding per-route whether it becomes permission-gated or stays hard-SuperAdmin by design, e.g. the Role Permission Editor itself probably *should* stay SA-only).
- RLS audit: grep all migrations for inline `unicorn_role`/`global_role` checks not delegating to a shared helper function, and produce a real count (this plan only confirmed one instance exists, not the full extent).
- Decision on whether Stages becomes its own `permission_features` module or folds under Packages (`packages.stages.*`) — product/data-model call, not just an engineering one.
- Confirm with Angela/Carl whether any of the 47 SuperAdmin-only routes are *intentionally* SA-only regardless of permission table state (e.g. system config, role permission editor) — those should be explicitly excluded from the route-guard migration, not swept in by default.
- Full census of every call site (Postgres function or frontend query) that filters `public.users` on `is_vivacity_internal` for a staff listing — gap #6 only fixed the 13 sites found by grep on 2026-08-25, not necessarily all of them — before deciding the final shape of a centralized `staff_directory`/`useListableStaff()` replacement.
- Derive every static and parameterized path from `src/App.tsx`, compare it with the client-route allowlist and `canAccessRoute()` behavior, and record an explicit classification for each route. Include a CI-facing regression test so a route added without a classification fails closed for client roles rather than inheriting a permissive default.

## Proposed phases (sequencing only)

**Implementation path (decided 2026-08-26):** these phases will be shipped as
direct git hotfixes reviewed via normal PRs, not phased Lovable prompts. That
matches how the rest of this remediation work (RBAC route classifier, Edge
Function auth gates, SharePoint/Firecrawl scoping) was actually delivered —
see `docs/claude-rbac-security-remediation-handoff-2026-08-26.md` — and the
root `CLAUDE.md` consolidation note that direct hotfixes are now the standing
default path for this repo, not something reserved for cases where a Lovable
prompt can't reach. Only route to a Lovable prompt instead if a specific
phase turns out to suit Lovable's generation flow better (e.g. broad UI
work) — it's not required by default the way earlier phrasing here implied.

**Phase 0 — Investigation** (see above). Read-only. Produces the real scope for Phases 1-4.

**Phase 1 — Route guard closure.** Extend `ProtectedRoute` to accept a permission-based alternative to `requireSuperAdmin` (e.g. a `requiredFeature`/`minLevel` prop backed by `usePermission`), and migrate the routes identified in Phase 0 that should be permission-gated rather than hard-SA-only. Keep client-route matching explicit and fail-closed, and have the guard and `canAccessRoute()` share the same classification source. This directly unblocks cases like AJ's.

**Phase 2 — Model Stages.** Add `stages.*` feature rows to `permission_features` (per the Phase 0 product decision on Packages vs. standalone), seed `role_permissions`, wire `StageBuilder.tsx` and related pages to `usePermission`, apply Phase 1's route-guard pattern to `/admin/stages`, `/admin/stage-builder`, `/admin/stage-analytics`.

**Phase 3 — RLS consolidation.** Based on Phase 0's audit findings, replace remaining inline role checks in RLS policies/functions with calls to `check_permission` (or the existing `is_*_safe` helpers where a coarse staff/SA check is genuinely sufficient and per-feature granularity isn't needed at the data layer).

**Phase 4 — Retire remaining raw frontend checks.** Work through the Phase 0 census, migrating legitimate permission gates to `usePermission` file by file. Add deep-link coverage alongside each migrated route, and retain explicit boolean checks only where they represent state rather than authority. Not a big-bang rewrite — same incremental discipline v5 already used.

**Phase 5 (lower priority, evaluate only) — JWT custom claims.** Weigh adopting Supabase's Custom Access Token Hook against the current double-query approach, given the claim-staleness trade-off. Only worth doing if the double-query pattern becomes a measured performance problem — not a default "do this because Supabase's doc says so."

**AJ's case specifically** is fully unblocked once Phase 1 (route guard closure) and Phase 2 (Stages modeled) ship — at that point granting AJ an additional `user_roles` row (or a `role_permissions` bump on CSC) via the existing, already-built Role Permission Editor UI is sufficient. No new mechanism is needed for the per-user-exception part; only the route-gate and Stages-modeling gaps block it today.

## Correction to `rbac-v5-implementation-plan.md`

That doc's header still reads "**Status:** In planning — Phase 0 ready to run", which is stale — its own phase-tracking table shows all 8 phases done. Flagging here rather than silently rewriting history in that file; whoever picks up Phase 0 of this plan should also fix that header.

## Cross-references

- [`rbac-v5-implementation-plan.md`](rbac-v5-implementation-plan.md) — the foundation this plan extends
- [`codebase-state/route-inventory-by-role.md`](../codebase-state/route-inventory-by-role.md) — source for the 47-route `requireSuperAdmin` count; re-derive if stale (routes churn fast per that doc's own header)
- [`pinned/decisions.md`](../pinned/decisions.md) — Open decisions entry pointing here
