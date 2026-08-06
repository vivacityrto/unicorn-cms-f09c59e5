# RBAC v6 — Gate Closure & Industry-Standard Alignment Plan

> **Last updated:** 2026-07-31 · **Reconsider by:** 2026-09-30 · **Confidence:** high on the findings below (grounded in live DB queries + source reads on 2026-07-31); low on effort/sizing estimates — no line-by-line codebase audit has been done yet (see "Investigation required before implementation").
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

## Investigation required before implementation

None of the following has been done yet — this plan intentionally stops short of it per this session's brief. Each must happen before its corresponding phase below is scoped into actual prompts/migrations:

- Full census of the 71 raw role-check files: which are permission gates (migrate to `usePermission`) vs. legitimate boolean checks (leave alone — e.g. disabled-account, loading states).
- Full list of the 47 `requireSuperAdmin` routes cross-referenced against which already have a corresponding `permission_features` row (some may — need row-by-row mapping before deciding per-route whether it becomes permission-gated or stays hard-SuperAdmin by design, e.g. the Role Permission Editor itself probably *should* stay SA-only).
- RLS audit: grep all migrations for inline `unicorn_role`/`global_role` checks not delegating to a shared helper function, and produce a real count (this plan only confirmed one instance exists, not the full extent).
- Decision on whether Stages becomes its own `permission_features` module or folds under Packages (`packages.stages.*`) — product/data-model call, not just an engineering one.
- Confirm with Angela/Carl whether any of the 47 SuperAdmin-only routes are *intentionally* SA-only regardless of permission table state (e.g. system config, role permission editor) — those should be explicitly excluded from the route-guard migration, not swept in by default.

## Proposed phases (sequencing only — not yet broken into Lovable prompts)

**Phase 0 — Investigation** (see above). Read-only. Produces the real scope for Phases 1-4.

**Phase 1 — Route guard closure.** Extend `ProtectedRoute` to accept a permission-based alternative to `requireSuperAdmin` (e.g. a `requiredFeature`/`minLevel` prop backed by `usePermission`), and migrate the routes identified in Phase 0 that should be permission-gated rather than hard-SA-only. This directly unblocks cases like AJ's.

**Phase 2 — Model Stages.** Add `stages.*` feature rows to `permission_features` (per the Phase 0 product decision on Packages vs. standalone), seed `role_permissions`, wire `StageBuilder.tsx` and related pages to `usePermission`, apply Phase 1's route-guard pattern to `/admin/stages`, `/admin/stage-builder`, `/admin/stage-analytics`.

**Phase 3 — RLS consolidation.** Based on Phase 0's audit findings, replace remaining inline role checks in RLS policies/functions with calls to `check_permission` (or the existing `is_*_safe` helpers where a coarse staff/SA check is genuinely sufficient and per-feature granularity isn't needed at the data layer).

**Phase 4 — Retire remaining raw frontend checks.** Work through the Phase 0 census, migrating legitimate permission gates to `usePermission` file by file. Not a big-bang rewrite — same incremental discipline v5 already used.

**Phase 5 (lower priority, evaluate only) — JWT custom claims.** Weigh adopting Supabase's Custom Access Token Hook against the current double-query approach, given the claim-staleness trade-off. Only worth doing if the double-query pattern becomes a measured performance problem — not a default "do this because Supabase's doc says so."

**AJ's case specifically** is fully unblocked once Phase 1 (route guard closure) and Phase 2 (Stages modeled) ship — at that point granting AJ an additional `user_roles` row (or a `role_permissions` bump on CSC) via the existing, already-built Role Permission Editor UI is sufficient. No new mechanism is needed for the per-user-exception part; only the route-gate and Stages-modeling gaps block it today.

## Correction to `rbac-v5-implementation-plan.md`

That doc's header still reads "**Status:** In planning — Phase 0 ready to run", which is stale — its own phase-tracking table shows all 8 phases done. Flagging here rather than silently rewriting history in that file; whoever picks up Phase 0 of this plan should also fix that header.

## Cross-references

- [`rbac-v5-implementation-plan.md`](rbac-v5-implementation-plan.md) — the foundation this plan extends
- [`codebase-state/route-inventory-by-role.md`](../codebase-state/route-inventory-by-role.md) — source for the 47-route `requireSuperAdmin` count; re-derive if stale (routes churn fast per that doc's own header)
- [`pinned/decisions.md`](../pinned/decisions.md) — Open decisions entry pointing here
