# P7 RBAC / Tenant Operating Model Decision Evidence Packet

> **Status:** preparation/evidence packet only. No implementation, no policy
> decision, no schema/RLS/RPC/Edge/migration change, no QA or production data
> change is made or authorized by this document.
> **Prepared:** 2026-09-09 · **Branch-cut:** `origin/main@461cc5aab` (merge of
> PR #1049, Codex's completed P7-A lifecycle-characterization packet)
> **Parent plan:** [Phase 2.6 Stabilization Plan](../phase-2-6-stabilization/phase-2-6-stabilization-plan.md) §9 "Phase 3 pilot packets"
> **Program index:** [Program Index](../../program-index.md)
> **Purpose:** collect, in one place, the current observed (proven) behavior
> and the still-open Vivacity/Carl decisions that gate Packets P7-B, P7-C and
> P7-D, so a future session does not have to re-derive this from three
> master plans and source.

## 1. Scope and explicit non-goals

**In scope:** reading and citing existing plans, KB docs, audit entries, and
current repository/migration source; producing one consolidated decision
matrix and blocker/sequencing recommendation.

**Explicitly out of scope / not done here:**

- No RBAC v6 or Tenant Operating Model implementation code.
- No answers to any of the open decisions below — they are recorded as open
  questions for Carl/Vivacity, not resolved.
- No schema, RLS, grant, RPC, Edge Function, migration, or production-data
  change of any kind. No `apply_migration`/`execute_sql` write was issued;
  one read-only `execute_sql` probe was attempted for live corroboration and
  was blocked by the auto-mode classifier (§8) — no live DB query ran in this
  session. All DB-behavior citations below are Tier B (repository migration
  source), not Tier A (live catalog), per the tenant-operating-model plan's
  own evidence-tier vocabulary (`tenant-operating-model-data-architecture-plan-2026-09-02.md:104-114`).
- No QA or production seeding, no credential/persona creation.
- No start of P7-B/P7-C/P7-D implementation.
- No change to `program-index.md` or any phase-plan status line — none of
  the four initiatives' official status has changed as a result of this
  packet.

## 2. Evidence sources — every file read

Plans and KB (full read unless noted):

- `AGENTS.md`
- `docs/kb/reference/program-index.md`
- `docs/kb/reference/rbac-v6-authorization-implementation-plan-2026-09-01.md` (all 904 lines)
- `docs/kb/reference/tenant-operating-model-data-architecture-plan-2026-09-02.md` (§1-7, §18-24 read in full; §8-17 read in the initial pass)
- `docs/kb/reference/codebase-optimization/phase-2-6-stabilization/phase-2-6-stabilization-plan.md` (header, §9, §10)
- `docs/kb/reference/codebase-optimization/phase-2-6-stabilization/progress-log.md` (sessions 38-41, P7-A)
- `docs/kb/reference/codebase-optimization/phase-2-6-stabilization/qa-environment-and-coverage-strategy.md` (full)
- `docs/kb/reference/codebase-optimization/phase-3/parallel-preparation-packets.md` (full, esp. Packet B)
- `docs/kb/codebase-state/tenant-p0-source-inventory.md` (full — TOM's own P0.1 artifact)
- `docs/audit-log/entries/2026-08-25-grant-authenticated-select-is-system-account.md` (referenced by RBAC §13 item 14, not re-read in full here — cited via AGENTS.md's own summary)

Source (current worktree, `origin/main@461cc5aab`):

- `src/hooks/useAuth.tsx` (full)
- `src/components/ProtectedRoute.tsx` (full)
- `src/hooks/useRBAC.tsx` (full)
- `src/lib/roles/vivacityRoles.ts` (full)
- `src/contexts/ClientTenantContext.tsx` (grep for `tenant_users`/`tenant_members`)
- `supabase/functions/_shared/requireCaller.ts` (header + `FeatureKeys`)
- `supabase/migrations/20260609052737_9cd9ed26-f55d-4fab-a3a4-272cbe1a58fc.sql` (latest tracked definitions of `is_super_admin_safe`, `is_vivacity_team_safe`, `check_permission`)
- `supabase/migrations/20260206210015_6505dd37-725f-4afe-9fc6-273c0fd86202.sql` (original `has_tenant_access_safe`/`has_tenant_admin_safe`, still the only tracked definition)
- `supabase/migrations/20260815080100_consolidate_is_super_admin.sql` (confirms `is_super_admin()`/`is_super_admin_safe(uuid)` are still the same predicate, just de-duplicated to one overload)
- repo-wide grep for `requireSuperAdmin` (7 files, 33 occurrences)

## 3. RBAC v6 §13 decision matrix

Source: `rbac-v6-authorization-implementation-plan-2026-09-01.md:817-855`. Each
row: the decision as posed, what is currently, provably true in this repo
today (**proven fact**), and what remains genuinely open. No row below
answers its own question.

| # | Decision | Current observed / proven fact | Open question | Decider |
|---|---|---|---|---|
| 1 | All-tenant staff read vs. portfolio scope | **Proven:** `has_tenant_access_safe(bigint,uuid)` — the only tracked definition, `supabase/migrations/20260206210015_...sql:60-77` — returns `true` for any user passing `is_super_admin_safe` **or** `is_vivacity_team_safe`, before ever checking `tenant_members`. `is_vivacity_team_safe` (`supabase/migrations/20260609052737_...sql:41-59`) matches all 7 roles in `src/lib/roles/vivacityRoles.ts:6-14` (Super Admin, Team Leader, Team Member, Integrator, BGT, CSC, CET) against `is_vivacity_internal=true` and not `archived`. So today, all 7 internal seats have blanket cross-tenant RLS access baked into the RLS helper itself — not merely a UI convention. | **Bounded baseline decided 2026-09-09 (ADR-015): preserve broad internal-staff tenant read access for now; scope sensitive actions separately.** The longer-term question—whether and for which seats RBAC v6 narrows read/write scope to portfolios or assignments—remains open. | Carl (baseline); Carl/Vivacity (future scope) |
| 2 | Authoritative CSC/BGT/CET/Integrator/Team Leader responsibilities | **Proven:** the only place these seats currently differ in effective capability is `src/hooks/useRBAC.tsx:27-155`'s `ROLE_PERMISSIONS` map (EOS meeting scheduling, rocks/risks escalation, `administration:access`, `staff_engagements:access` for Integrator only) — a client-side, non-database-enforced permission list. At the RLS/tenant-access layer (row 1) all 7 seats are identical. No authoritative job-seat responsibility document exists in the KB (`docs/kb/pinned/team-roles.md`'s scope is explicitly unresolved per RBAC plan §11). | What each seat's actual duties/capabilities should be, and whether `team-roles.md` describes engineering seats, app RBAC seats, or both. | Carl/Vivacity (product-owner + one rep per seat, per §7 P1) |
| 3 | Hard Super Admin vs. delegation / break-glass | **Proven:** `is_super_admin_safe(uuid)` (`supabase/migrations/20260609052737_...sql:67-85`) is the sole predicate behind `is_super_admin()` (consolidated to one overload in `supabase/migrations/20260815080100_consolidate_is_super_admin.sql:136-146`) and behind the frontend's `isSuperAdmin()` (`src/hooks/useAuth.tsx:159-162`, checking `global_role==='SuperAdmin' \|\| unicorn_role==='Super Admin'`). It gates 33 `requireSuperAdmin` occurrences repo-wide (7 files: `App.tsx` 6, `ProtectedRoute.tsx` 3 (definition), `dashboardRoutes.tsx` 15 (real route gates), `PermissionGate.tsx` 1, `useStaffFacilitatorNames.ts` 1, plus 7 test-file occurrences). There is no break-glass account concept anywhere in source — every daily Super Admin account *is* the only privileged tier. | Which specific actions must stay hard-SA vs. become delegable, and whether true non-daily break-glass accounts are needed. | Carl/Vivacity |
| 4 | Second approver for temporary grants | No grant-approval workflow exists yet (RBAC v6 P7 is unbuilt); `user_roles` currently has 2 active ungoverned grants (RBAC plan §3.2). | Whether high-risk delegated grants need dual approval or should stay non-delegable. | Carl/Vivacity |
| 5 | Expiry default / review cadence for grants | No expiry mechanism exists on `user_roles` today beyond the `expires_at` column read by `check_permission` (`supabase/migrations/20260609052737_...sql:241-247` — NULL or future). | What default expiry and review cadence to require. | Carl/Vivacity |
| 6 | AJ pilot exact tenant/resource scope | Not yet defined; RBAC plan P4 requires this before any Stage capability ships. | Named tenants/scope for the AJ/CSC pilot. | Carl/Vivacity |
| 7 | Disabled/archived session behavior | **Proven, and this is a live defect, not a hypothetical:** `ProtectedRoute.tsx:44-57` fetches `users.disabled` in a separate query and on any query **error** sets `disabled: false` (fail-open) at line 53-56. Separately, none of `check_permission` (`supabase/migrations/20260609052737_...sql:213-223`, checks only `archived`), `is_super_admin_safe`, or `is_vivacity_team_safe` reference a `disabled` column at all — only `archived`. `supabase/functions/_shared/requireCaller.ts` (the canonical Edge gate, routes through `check_permission`) has zero references to `disabled`. This is the exact gap the stabilization plan's "disabled-user hotfix" (blocking P7-D, see §7 below) must close — that hotfix does not yet exist anywhere in this repo. | Whether disabled/archived users should be force-signed-out immediately, and the recovery path. | Carl/Vivacity |
| 8 | Quarterly access-review owner | Not yet defined; no review workflow exists. | Named owner. | Carl/Vivacity |
| 9 | Disposable environment/persona process for write/expiry/disable/cross-tenant tests | **Proven, and largely already answered by prior work, not a blank slate:** `unicorn-qa` (project `qfpxvumcrnzrjyvqkicq`) is a live, parity-verified, isolated Supabase project with a layered `qa:*` suite programme — see §6 below. This is exactly the "approved... process" RBAC §13 item 9 asks for; it already covers RLS, contract, Edge, data-lifecycle, residue, cron-safety, migration-replay and authenticated e2e testing. | Whether Carl/Vivacity formally ratifies `unicorn-qa` + the P2-QA suite set as the standing answer to this item (it was built to satisfy stabilization-plan needs, not explicitly ratified against this RBAC §13 item yet). | Carl/Vivacity (low-effort: mostly confirming existing work) |
| 10 | Mismatch observation window / go-no-go thresholds | Not yet defined; RBAC plan §8.4 requires this per risk class before any shadow cutover. | Window length and thresholds per risk class. | Carl/Vivacity |
| 11 | Messaging privacy model (tenant-shared vs. participant-private) + participant add/remove authority | **Proven for the message/conversation row itself:** AGENTS.md's own recorded verification (`AGENTS.md`, "Known gap, parked for later" note) confirms live `pg_policies` scope message `SELECT` to actual `is_conversation_participant_safe`/`has_tenant_access_safe`-gated participant membership — i.e., **participant-private**, not blanket tenant-shared, for the message row today. Not yet characterized: whether previews, notifications, timeline events, and Ask Viv recent-communications facts (which RBAC plan §8.6 item 9 flags as a leak risk) follow the same participant-private rule or a looser tenant-shared one. | Confirm the privacy model for every adjacent surface (preview/notification/timeline/Ask Viv), and who may add/remove participants. | Carl/Vivacity |
| 12 | Portfolio-scoped staff messaging notification/rights | Depends on item 1's outcome; unstarted. | Which roles/relationships keep list/read/reply/assign/resolve rights if staff scope narrows. | Carl/Vivacity |
| 13 | Academy-only client users in ordinary messaging/broadcast | Not yet characterized. | Include or exclude Academy-only users from ordinary comms. | Carl/Vivacity |
| 14 | Person-picker genuine-vs-system-account classification | **Parked 2026-09-07 by Carl** (RBAC plan §13 item 14, verbatim in source). `is_system_account` flag exists (`docs/audit-log/entries/2026-08-25-grant-authenticated-select-is-system-account.md`) but whether it already covers this is unresolved. | Whether existing `is_system_account` suffices or a broader classification is needed, and where the exclusion logic belongs. | Carl/Vivacity (explicitly deferred — do not re-open) |
| 15 | 72 tenant-less `public.users` rows | **Parked 2026-09-08 by Carl.** Full detail lives at TOM §18 item 14 (§4 row 14 below) — same underlying population, cross-referenced from both plans. | See TOM §18 item 14. | Carl/Vivacity (explicitly deferred — do not re-open) |

## 4. Tenant Operating Model §18 decision matrix

Source: `tenant-operating-model-data-architecture-plan-2026-09-02.md:1051-1101`.

| # | Decision | Current observed / proven fact | Open question | Decider |
|---|---|---|---|---|
| 1 | All-tenant staff read vs. portfolio scope | Same underlying fact as RBAC §13 item 1 (§3 row 1 above) — this is one decision referenced from both plans, not two independent ones. TOM plan explicitly gates further internal-staff-scope work behind RBAC v6's decision (`program-index.md:43-47`, "Stop gate"). | Same as RBAC §13 item 1. | Carl/Vivacity |
| 2 | Meanings/transitions of raw status, lifecycle_status, access_status | **Proven:** live combinations already show drift, including the raw typo `In Arears` in both enabled/disabled forms (TOM plan §5.5). P7-A's own live read (`progress-log.md` session 39) separately confirmed `dd_lifecycle_type` is a distinct process-type lookup (client/staff onboarding/offboarding templates), **not** the tenant lifecycle-status table — the two "lifecycle" vocabularies must not be conflated. | Canonical meanings and allowed transitions for the three tenant-level fields. | Carl/Vivacity |
| 3 | `tenants.id` vs `id_uuid` as canonical key | **Proven:** all 415 current tenants have `id_uuid`; only 2 have `unicorn1_id`; 411 have `id != import_id` (TOM plan §5.2). Plan already decided to treat `tenants.id` as canonical until proven otherwise — this is a working default, not yet a ratified decision. | Whether a future key migration is ever required. | Carl/Vivacity (mostly a confirmation of the plan's working default) |
| 4 | 758 `tenant_profile` / 349 unmatched `tenant_members` / 25 unmatched `package_instances` | **Proven (counts):** TOM plan §5.4 — zero unmatched in `notes`/`client_notes`/`tenant_users`/CSC assignments; 349 unmatched in `tenant_members`; 25 in `package_instances`; `tenant_profile` has 758 distinct IDs vs 415 current tenants. | What these unmatched rows represent (legacy namespace vs. retained history vs. genuine orphans) — explicitly a classification task, not a deletion decision. | Carl/Vivacity + engineering classification pass |
| 5 | `tenant_users` vs `tenant_members` — which is authoritative for membership | **Proven, and this is a real, currently-live split, not a hypothetical:** `src/contexts/ClientTenantContext.tsx:86,195` gates client-portal tenant context on `tenant_users`. `src/hooks/useAuth.tsx:122-128` (`fetchMemberships`) and its `hasTenantAccess`/`hasTenantAdmin`/`getTenantRole` helpers (`useAuth.tsx:164-178`) read `tenant_members` exclusively. The RLS-layer `has_tenant_access_safe`/`has_tenant_admin_safe` (`supabase/migrations/20260206210015_...sql:60-101`) also read only `tenant_members`. So today, client-portal routing trusts one table while the RBAC helper layer and RLS trust a different one — a genuine dual-source-of-truth condition already in production, not a proposed risk. | Which table is authoritative going forward for membership/contacts/invitations/client administration, and how to reconcile the two live call sites above. | Carl/Vivacity |
| 6 | `package_instances` authority vs. legacy `package_id`/`package_ids`/`stage_ids` on `tenants` | **Proven:** 31 tenants still have non-empty `package_ids`, 31 have legacy `package_id`, 6 have non-empty `stage_ids` (TOM plan §5.2). | Which remaining callers legitimately use the legacy arrays. | Carl/Vivacity + engineering caller audit |
| 7 | KPI card exactness vs. bounded freshness | Not yet measured against a real p95/payload baseline (TOM plan §4.1 request-graph figures are code-derived, not yet HAR-measured). | Acceptable freshness/approximation for whole-book KPI cards. | Carl/Vivacity |
| 8 | Operational directory/context freshness SLOs | Not yet defined; all numeric SLOs in the plan are explicitly labelled "proposed" (evidence tier E, §2 evidence-tiers table). | Concrete SLOs. | Carl/Vivacity |
| 9 | Ask Viv source indexing/retention/deletion/scope | TOM plan §6.4's consumer/access contract table already frames staff vs. client Ask Viv as separately gated (`staff.ai` + explicit tenant-fact scope vs. active client membership), but no capability/retention decision has been ratified. | Which sources, retention/deletion SLA, staff/client capability scopes. | Carl/Vivacity |
| 10 | First governed BI decision | Not yet defined; explicitly a P2+ decision gated behind RBAC/TOM cutover per `program-index.md`. | What the first BI pilot question is. | Carl/Vivacity |
| 11 | Xero as financial source of truth | Current Xero fields are cached integration state (TOM plan §3, "Product invariants to preserve"), not yet formally ratified as sole source of truth. | Confirm Xero's role and which entity/account is connected. | Carl/Vivacity |
| 12 | Disposable environment/persona process for mutation/cross-tenant tests | Same answer as RBAC §13 item 9 — `unicorn-qa` + the P2-QA suite programme already exists and is live-proven (§6 below). | Same ratification question as RBAC §13 item 9. | Carl/Vivacity |
| 13 | Observation window/canary/performance budget/rollback owner per risk class | Not yet defined. | Concrete values per risk class. | Carl/Vivacity |
| 14 | 72 tenant-less `public.users` rows | **Parked 2026-09-08 by Carl. Proven, heterogeneous population** (confirmed via direct SQL per the plan text, not assumed): ~61 genuine internal Vivacity staff (44 `@vivacity.com.au` + 17 `@vivacitycoaching.com.au`) who plausibly belong to tenant 6372 ("Vivacity Coaching & Consulting", confirmed to exist); 4 real external client-domain users (Brian Cannan/thinkrealestate.net.au, Luckmali Fernando/australiancollege.edu.au, Tania Allen/visionalliance.com.au, Patrick DCruze/mind-makers.ai) with **no fuzzy-matched tenant found** for any of them — genuinely orphaned, not mislinked; 6 test/dev/typo noise rows. Assigning the 4 external rows to Vivacity's own tenant would be wrong (grants visibility into Vivacity's internal client data). | Business-knowledge identification of the 4 external users' real tenant; whether/how to bulk-assign the ~61 staff rows to tenant 6372; disposition of the 6 noise rows. | Carl/Vivacity (explicitly deferred — do not re-open; also cross-referenced from RBAC §13 item 15) |

## 5. Current observed CSC and Super Admin behavior (source-cited, not assumed)

**Super Admin.** `isSuperAdmin()` (`src/hooks/useAuth.tsx:159-162`) is `global_role==='SuperAdmin' \|\| unicorn_role==='Super Admin'`. It backs the DB predicate `is_super_admin_safe(uuid)` (`supabase/migrations/20260609052737_9cd9ed26-f55d-4fab-a3a4-272cbe1a58fc.sql:67-85`: `unicorn_role='Super Admin' OR global_role='SuperAdmin'`, `is_vivacity_internal=true`, `archived IS DISTINCT FROM true` — **no `disabled` check**), consolidated to a single no-arg overload `is_super_admin()` in `supabase/migrations/20260815080100_consolidate_is_super_admin.sql:136-149`. It gates 33 `requireSuperAdmin` route occurrences (§3 row 3), and unconditionally short-circuits `check_permission` to `true` (`supabase/migrations/20260609052737_...sql:199-202`) and `has_permission`/`has_tenant_access_safe`/`has_tenant_admin_safe` the same way. There is no separate hard-SA/break-glass tier anywhere in source — "Super Admin" is a single undifferentiated privilege level today, matching RBAC plan §3.1's finding verbatim.

**CSC.** CSC is one of the 7 roles in `VIVACITY_STAFF_ROLES` (`src/lib/roles/vivacityRoles.ts:6-14`) and in `is_vivacity_team_safe`'s role list (`supabase/migrations/20260609052737_...sql:52-55`), so a CSC principal has the same blanket `has_tenant_access_safe` pass as every other internal seat (§3 row 1). At the feature-permission layer, `useRBAC.tsx`'s `ROLE_PERMISSIONS['CSC']` (`useRBAC.tsx:124-132`) grants `advanced_features:access`, `eos:access`, `ask_viv:access`, `rocks:create`/`edit_own`, `risks:create`/`escalate` — narrower than Super Admin/Team Leader/Integrator (no `administration:access`, no EOS-meeting scheduling/editing, no QC sign-off). Live-proven 2026-09-09 (`progress-log.md` session 41): a real CSC-role QA account, authenticated and read-only browser-swept, was redirected away from `/admin/lifecycle-checklists` and `/admin/sharepoint-sites` to `/dashboard` (confirming the route-level `requireSuperAdmin` boundary holds for CSC in practice, not just in source), while `/dashboard`, `/manage-tenants`, `/manage-documents`, `/manage-stages`, `/communications`, `/superadmin/academy/enrollments`, and `/eos` all rendered normally for the same CSC session.

## 6. Source-of-truth, route, query, RPC, and enforcement-point inventory

Per RBAC plan §7 P0.1-P0.3 (`rbac-v6-authorization-implementation-plan-2026-09-01.md:348-378`), P0.1 is a versioned inventory of routes/checks/RPCs/RLS; P0.2 is the permission-mutation/audit-atomicity fix; P0.3 is the shadow `is_active_principal_v6()` rollout. **None of P0.1-P0.3 has started as a tracked implementation packet** — `program-index.md:23` records RBAC v6 status as "Implementation plan only... awaiting the plan's own §13 decisions," with no PR against it. This packet is not that inventory; it is a bounded citation set sufficient for the P7 gate:

| Layer | Object | Evidence |
|---|---|---|
| Route guard | `ProtectedRoute` (`requireSuperAdmin`, `allowedRoles`, `allowVivacityTeam`) | `src/components/ProtectedRoute.tsx:12-19, 152-179` |
| Route guard usage | 33 `requireSuperAdmin` occurrences across `App.tsx` (6), `dashboardRoutes.tsx` (15, the real gates), `ProtectedRoute.tsx` (3, definition), `PermissionGate.tsx` (1), `useStaffFacilitatorNames.ts` (1), 2 test files (7) | repo-wide grep, this session |
| Client-side permission model | `ROLE_PERMISSIONS`, `canAccessRoute`, `ADMIN_ROUTES`, `EOS_ROUTES`, `CLIENT_ROUTES` | `src/hooks/useRBAC.tsx:27-355` |
| Role roster (single source) | `VIVACITY_STAFF_ROLES` | `src/lib/roles/vivacityRoles.ts:6-14` |
| Session/profile/membership | `AuthProvider` (`fetchUserProfile`, `fetchMemberships`, `isSuperAdmin`, `hasTenantAccess`, `hasTenantAdmin`, `getTenantRole`) | `src/hooks/useAuth.tsx:49-198` |
| Disabled-state check (separate, fail-open) | `ProtectedRoute`'s own `users.disabled` query | `src/components/ProtectedRoute.tsx:38-61` (error path sets `disabled:false` at line 53) |
| DB: Super Admin predicate | `is_super_admin_safe(uuid)`, `is_super_admin()` | `supabase/migrations/20260609052737_...sql:67-85`; `supabase/migrations/20260815080100_...sql:136-149` |
| DB: staff-roster predicate | `is_vivacity_team_safe(uuid)` | `supabase/migrations/20260609052737_...sql:41-59` |
| DB: tenant-access predicate | `has_tenant_access_safe(bigint,uuid)`, `has_tenant_admin_safe(bigint,uuid)` | `supabase/migrations/20260206210015_...sql:60-101` (only tracked definition) |
| DB: feature-permission predicate | `check_permission(uuid,text,text)` | `supabase/migrations/20260609052737_...sql:165-253` |
| Edge gate | `requireCaller` (routes through `check_permission`), `FeatureKeys` | `supabase/functions/_shared/requireCaller.ts:1-60` |
| Client-portal tenant context (parallel path) | `ClientTenantContext` reading `tenant_users` | `src/contexts/ClientTenantContext.tsx:86,195` |
| Messaging RLS (participant-private, live-verified) | `is_conversation_participant_safe`, `has_tenant_access_safe` | `AGENTS.md` "Known gap, parked for later" note (verified via Supabase MCP against live `pg_policies`) |
| Lifecycle-checklists pilot boundary (P7-A, done) | `LifecycleChecklistsAdmin.tsx`, `useLifecycleChecklists.ts`, route under `requireSuperAdmin`, DB policy `is_vivacity_staff` | `progress-log.md` sessions 38-41; `src/test/admin/lifecycle-checklists.test.tsx` |
| Approved disposable-QA process | `unicorn-qa` (`qfpxvumcrnzrjyvqkicq`) + P2-QA suites | `qa-environment-and-coverage-strategy.md` (full doc) |

## 7. Proven facts vs. proposed policy — recap

Every row in §3-§6 above is already labelled **Proven** (source- or live-verified today) or framed as an **Open question** for Carl/Vivacity. The one cross-cutting proven fact worth restating on its own: RBAC v6 and Tenant Operating Model are both, today, still governed entirely by the *current* behavior described here — no shadow evaluator, no capability catalogue, no portfolio scoping, and no disabled-state enforcement exist yet in any form. Nothing in this packet should be read as a recommendation for what the policy *should* be; every "should"/"whether" phrase above is Vivacity's to answer, not this packet's.

## 7.1 Baseline vocabulary proposal and bounded staff-read decision

This is a deliberately narrow proposal to make the Phase 3 gate discussable;
it does not approve a role bundle, change a route, or authorize an
enforcement cutover. It records the smallest shared language that the
Super Admin and CSC baseline can use before broader seat policy is settled.
Carl agreed the bounded staff-read baseline on 2026-09-09: preserve current
broad internal-staff tenant read access for now, while sensitive actions are
scoped separately. This is not a final portfolio-scope decision and does not
authorize a production policy change.

| Term | Baseline meaning | Pilot implication |
|---|---|---|
| **Principal state** | active, disabled, archived, or system | State is evaluated first; inactive or disallowed principals deny. |
| **Job role / seat** | Super Admin, CSC, or another reviewed human/machine seat | A seat supplies defaults; it is not itself a permission or tenant scope. |
| **Capability / action** | An atomic verb-ended operation such as `lifecycle.templates.view` or `lifecycle.templates.edit` | The pilot names actions explicitly instead of treating “admin” as a capability. |
| **Scope** | The target extent, such as `own_resource`, `assigned_tenants`, `explicit_tenant`, `all_tenants`, or `global` | Scope is evaluated against the server-resolved target; it is not a privilege level. |
| **Relationship** | A named relation to the target, such as tenant membership, assignment, ownership, or facilitation | A matching role is insufficient when the required relationship is absent. |

The proposed authority boundary is equally narrow and follows the existing
RBAC plan: a canonical server decision core is the security authority;
Postgres RLS, RPCs, and Edge Functions enforce their own server-side checks;
React route/navigation guards remain UX gates and may not widen access. The
decision contract denies unknown capabilities, missing required context,
inactive principals, and evaluator failures. During migration, a capability
has one authority at a time and shadow comparisons must never combine legacy
and v6 results with `OR`, `AND`, or fallback-to-allow.

For the current lifecycle baseline, Super Admin remains the allowed route
persona and CSC remains the route-forbidden persona already proven in session
41. Those are characterization cases, not approval of future Super Admin or
CSC capability bundles. No staff-scope, hard-Super-Admin/break-glass,
disabled-user, schema, RLS, RPC, Edge, grant, or production-data decision is
made by this proposal; those remain the open questions in §3 and the separate
disabled-user hotfix gate for P7-D.

**Remaining decision requested:** Carl/Vivacity should confirm whether the
vocabulary and authority boundary above are acceptable for a read-only/shadow
P7-B or P7-C slice. The staff-read baseline is recorded, but a “yes” to this
remaining vocabulary decision would unblock only that bounded preparation or
shadow work; it would not authorize a policy migration or production change.

## 8. Verification / commands run this session

- `git fetch origin`; `git worktree list` (confirmed the three other in-flight worktrees named in the task and left them untouched).
- `git worktree add -b claude/p7-rbac-tenant-decision-evidence .claude/worktrees/p7-rbac-tenant-decision-evidence origin/main` (branch cut at `461cc5aab`, the merge commit of PR #1049).
- Full reads of the plan/KB files listed in §2.
- Repo-wide `Grep` for `requireSuperAdmin` (7 files, 33 occurrences — see §6).
- Targeted `Grep`/`Read` of the migration files listed in §2 for `is_super_admin_safe`, `is_vivacity_team_safe`, `has_tenant_access_safe`, `check_permission`, confirming each is a Tier-B (repository source), not Tier-A (live), citation.
- One `mcp__supabase__execute_sql` read-only probe (`select current_database(), inet_server_addr()`) was attempted to corroborate the migration-text findings against the live catalog; it was **denied by the auto-mode classifier** in this session. No live database query ran. Every DB-behavior claim above is therefore Tier B only — a future session with live-query authority should re-verify §3 rows 1/3/7 and §4 row 5/9 against live `pg_proc`/`pg_policies` before treating them as Tier A.
- `node scripts/check-kb-links.mjs` — run before opening the PR (see PR description for result).
- `node scripts/check-kb-doc-size.mjs` — run before opening the PR (see PR description for result); this file lives under `codebase-optimization/phase-3/` so the 750-line phase-doc ceiling applies.

## 9. Exact blockers and recommended sequencing for P7-B/C/D

Per `phase-2-6-stabilization-plan.md:404-422`:

> "Do not begin until P6-A has parity evidence and the RBAC vocabulary decision explicitly says where authorization predicates live."

**P6-A is already closed** (`phase-2-6-stabilization-plan.md:36-37`: "P1-C, P4-A, P4-B, P4-C, P4-D, P6-A and the completed P6-B cohorts are closed") — its parity-evidence half of the gate is satisfied today. The remaining, genuinely open blocker for P7-B and P7-C is the **RBAC vocabulary decision** — read narrowly, this means at minimum RBAC §13 items 1-3 (§3 rows 1-3 above: staff scope, seat responsibilities, hard-SA vs. delegation), since those three determine where an authorization predicate for a route-guard-shaped pilot like Lifecycle Checklists should live. This is this packet's own reasoned scoping, not a quote from the plan — Vivacity should confirm whether a narrower or wider subset of §13 is required before treating the gate as satisfied.

P7-D carries one additional, separate blocker: the **disabled-user hotfix**, which does not exist anywhere in this repo yet (§3 row 7 — `ProtectedRoute.tsx:51-56`'s fail-open behavior on a `users.disabled` query error is the live defect it must close, and no DB-layer predicate checks `disabled` at all today).

**Recommended sequencing**, given the above:

1. **Do not start P7-B, P7-C, or P7-D yet.** The RBAC vocabulary decision has not been made — this packet exists to make that decision easy to reach, not to substitute for it.
2. **Fastest unblock path:** bring RBAC §13 items 1, 2, 3, and 7 (§3 rows 1/2/3/7) to Carl/Vivacity first, as a bounded subset, rather than waiting for all 15 §13 items — items 4-6, 8, 10, 12-13 do not block P7-B/C/D specifically (they gate later RBAC phases: P4 AJ pilot, P7 delegation, P1 messaging cutover). Items 9 and 11 are largely pre-answered already (§3 rows 9, 11) and mainly need ratification, not fresh decision-making.
3. **Once items 1-3 and 7 are answered:** P7-B (minimal feature-boundary extraction, keeping the existing `requireSuperAdmin` guard) can proceed first — it is the smallest, lowest-risk slice and its own success measure is "neutral/negative LOC," not a policy change.
4. **P7-C** (the `src/ARCHITECTURE.md` page + scoped lint boundary, confined to the lifecycle pilot) can follow immediately after P7-B, since it has no additional decision dependency beyond the shared RBAC vocabulary gate.
5. **P7-D** (auth/profile/membership seam separation) should be sequenced last and only after both (a) the RBAC vocabulary decision and (b) a dedicated disabled-user hotfix PR — fixing `ProtectedRoute.tsx`'s fail-open disabled check and adding a `disabled` check to `check_permission`/`is_super_admin_safe`/`is_vivacity_team_safe` (or their v6 successors) — has shipped and been verified live. That hotfix is itself a small, independent, immediately actionable PR that does not require any of the still-open §13/§18 decisions above; it can be scoped and shipped in parallel with the vocabulary-decision conversation rather than waiting on it.
6. Independently of P7-B/C/D: TOM §18 item 5 (`tenant_users` vs `tenant_members`, §4 row 5) is a live dual-source-of-truth condition already in production and worth flagging to Carl/Vivacity on its own timeline, not only as part of the broader TOM decision batch — it currently affects client-portal routing correctness, not just future architecture.
7. Carry RBAC §13 items 14/15 and their TOM §18 item 14 counterpart forward as already-parked — do not re-raise them as if newly discovered.
