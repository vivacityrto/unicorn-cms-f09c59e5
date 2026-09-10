# P7 RBAC / Tenant Operating Model Decision Evidence Packet

> **Status:** preparation/evidence packet only. No implementation, no policy
> decision, no schema/RLS/RPC/Edge/migration change, no QA or production data
> change is made or authorized by this document.
> **Prepared:** 2026-09-09 · **Branch-cut:** `origin/main@461cc5aab` (merge of
> PR #1049, Codex's completed P7-A lifecycle-characterization packet)
> **Parent plan:** [Phase 2.6 Stabilization Plan](../phase-2-6-stabilization/phase-2-6-stabilization-plan.md) §9 "Phase 3 pilot packets"
> **Program index:** [Program Index](../../program-index.md)
> **Truth-sync:** 2026-09-10 — direct Carl/Codex policy baseline recorded below;
> implementation and production enforcement remain unauthorized.
> **Purpose:** collect, in one place, the current observed (proven) behavior,
> the historical Vivacity/Carl decision record, and the current policy baseline
> so a future session does not have to re-derive this from three master plans and
> source.

## 1. Scope and explicit non-goals

**In scope:** reading and citing existing plans, KB docs, audit entries, and
current repository/migration source; producing one consolidated decision
matrix and blocker/sequencing recommendation.

**Explicitly out of scope / not done here:**

- No RBAC v6 or Tenant Operating Model implementation code.
- The §3/§4 matrices preserve the 2026-09-09 open-question record. The dated
  truth-sync addendum below records the policy baseline agreed on 2026-09-10;
  exact capability rows, implementation sequencing, and the parked items remain
  open.
- No schema, RLS, grant, RPC, Edge Function, migration, or production-data
  change of any kind. No `apply_migration`/`execute_sql` write was issued;
  one read-only `execute_sql` probe was attempted for live corroboration and
  was blocked by the auto-mode classifier (§8) — no live DB query ran in this
  session. All DB-behavior citations below are Tier B (repository migration
  source), not Tier A (live catalog), per the tenant-operating-model plan's
  own evidence-tier vocabulary (`tenant-operating-model-data-architecture-plan-2026-09-02.md:104-114`).
- No QA or production seeding, no credential/persona creation.
- No P7-B/P7-C/P7-D implementation was started by this evidence packet; those
  slices were implemented separately and are now recorded in the Phase 2.6
  stabilization plan.
- At preparation time (2026-09-09), no change to `program-index.md` or any
  phase-plan status line had been made. This 2026-09-10 documentation sync now
  updates `program-index.md` and this packet's status language; no phase-plan
  implementation status is changed here.

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
| 2 | Authoritative CSC/BGT/CET/Integrator/Team Leader responsibilities | **Proven:** the only place these seats currently differ in effective capability is `src/hooks/useRBAC.tsx:27-155`'s `ROLE_PERMISSIONS` map (EOS meeting scheduling, rocks/risks escalation, `administration:access`, `staff_engagements:access` for Integrator only) — a client-side, non-database-enforced permission list. At the RLS/tenant-access layer (row 1) all 7 seats are identical. No authoritative job-seat responsibility document exists in the KB (`docs/kb/pinned/team-roles.md`'s scope is explicitly unresolved per RBAC plan §11). | **Bounded baseline decided 2026-09-09 (ADR-016):** Super Admin covers governance/security/system configuration and approved cross-tenant controls; CSC covers client coordination and approved package/stage/Academy workflows; BGT/CET/Integrator/Team Leader/Team Member remain unassigned pending validation. | Carl (baseline); Carl/Vivacity (future seat catalogue) |
| 3 | Hard Super Admin vs. delegation / break-glass | **Proven:** `is_super_admin_safe(uuid)` (`supabase/migrations/20260609052737_...sql:67-85`) is the sole predicate behind `is_super_admin()` (consolidated to one overload in `supabase/migrations/20260815080100_consolidate_is_super_admin.sql:136-146`) and behind the frontend's `isSuperAdmin()` (`src/hooks/useAuth.tsx:159-162`, checking `global_role==='SuperAdmin' \|\| unicorn_role==='Super Admin'`). It gates 33 `requireSuperAdmin` occurrences repo-wide (7 files: `App.tsx` 6, `ProtectedRoute.tsx` 3 (definition), `dashboardRoutes.tsx` 15 (real route gates), `PermissionGate.tsx` 1, `useStaffFacilitatorNames.ts` 1, plus 7 test-file occurrences). There is no break-glass account concept anywhere in source — every daily Super Admin account *is* the only privileged tier. | **Bounded baseline decided 2026-09-09 (ADR-016): keep high-risk control-plane actions Super Admin-only for now; consider routine CSC delegation only through explicit capabilities, scope, relationships, audit, and review.** The exact capability catalogue, approval workflow, and true non-daily break-glass need remain open. | Carl (baseline); Carl/Vivacity (future policy) |
| 4 | Second approver for temporary grants | No grant-approval workflow exists yet (RBAC v6 P7 is unbuilt); `user_roles` currently has 2 active ungoverned grants (RBAC plan §3.2). | **Bounded baseline decided 2026-09-09 (ADR-016):** high-risk grants require a second approver; ordinary narrow operational grants may use one approver; self-approval is prohibited and rationale/scope/expiry must be recorded. | Carl (baseline); Carl/Vivacity (future workflow) |
| 5 | Expiry default / review cadence for grants | No expiry mechanism exists on `user_roles` today beyond the `expires_at` column read by `check_permission` (`supabase/migrations/20260609052737_...sql:241-247` — NULL or future). | **Bounded baseline decided 2026-09-09 (ADR-016):** 30-day expiry for high-risk grants, 90-day expiry for ordinary temporary operational grants, quarterly review, and explicit renewal. | Carl (baseline); Carl/Vivacity (future workflow) |
| 6 | AJ pilot exact tenant/resource scope | Not yet implemented; RBAC plan P4 requires this before any Stage capability ships. | **Bounded baseline decided 2026-09-09 (ADR-016):** AJ Delostrico's assigned active-client portfolio; explicitly named package/stage create/edit and approved Academy actions only; no delete, bulk, publish/archive, assignment, or cross-portfolio action. | Carl (baseline); Carl/Vivacity (future implementation) |
| 7 | Disabled/archived session behavior | **Proven, and this is a live defect, not a hypothetical:** `ProtectedRoute.tsx:44-57` fetches `users.disabled` in a separate query and on any query **error** sets `disabled: false` (fail-open) at line 53-56. Separately, none of `check_permission` (`supabase/migrations/20260609052737_...sql:213-223`, checks only `archived`), `is_super_admin_safe`, or `is_vivacity_team_safe` reference a `disabled` column at all — only `archived`. `supabase/functions/_shared/requireCaller.ts` (the canonical Edge gate, routes through `check_permission`) has zero references to `disabled`. This is the exact gap the stabilization plan's "disabled-user hotfix" (blocking P7-D, see §7 below) must close — that hotfix does not yet exist anywhere in this repo. | **Bounded baseline decided 2026-09-09 (ADR-016):** disabled/archived users deny new access, sessions are revoked promptly, unavailable status checks fail closed, and recovery requires approved administrator action. | Carl (baseline); Carl/Vivacity (future implementation) |
| 8 | Quarterly access-review owner | Not yet defined; no review workflow exists. | **Bounded baseline decided 2026-09-09 (ADR-016):** Carl/Vivacity owns the policy; a named Operations delegate prepares evidence covering roles, grants, expirations, and exceptions. | Carl |
| 9 | Disposable environment/persona process for write/expiry/disable/cross-tenant tests | **Proven, and largely already answered by prior work, not a blank slate:** `unicorn-qa` (project `qfpxvumcrnzrjyvqkicq`) is a live, parity-verified, isolated Supabase project with a layered `qa:*` suite programme — see §6 below. This is exactly the "approved... process" RBAC §13 item 9 asks for; it already covers RLS, contract, Edge, data-lifecycle, residue, cron-safety, migration-replay and authenticated e2e testing. | **Bounded baseline decided 2026-09-09 (ADR-016):** ratify `unicorn-qa` + the P2-QA suite set as the standing disposable environment/persona process. | Carl |
| 10 | Mismatch observation window / go-no-go thresholds | Not yet defined; RBAC plan §8.4 requires this per risk class before any shadow cutover. | **Bounded baseline decided 2026-09-09 (ADR-016):** observe for 14 days; require zero unexpected v6-only allows, zero unexplained legacy-allow/v6-deny lockouts, and review every mismatch before cutover. | Carl (baseline); Carl/Vivacity (future go/no-go owner) |
| 11 | Messaging privacy model (tenant-shared vs. participant-private) + participant add/remove authority | **Proven for the message/conversation row itself:** AGENTS.md's own recorded verification (`AGENTS.md`, "Known gap, parked for later" note) confirms live `pg_policies` scope message `SELECT` to actual `is_conversation_participant_safe`/`has_tenant_access_safe`-gated participant membership — i.e., **participant-private**, not blanket tenant-shared, for the message row today. Not yet characterized: whether previews, notifications, timeline events, and Ask Viv recent-communications facts (which RBAC plan §8.6 item 9 flags as a leak risk) follow the same participant-private rule or a looser tenant-shared one. | **Bounded baseline decided 2026-09-09 (ADR-016):** internal staff retain portfolio-wide messaging access; consultant/assistant relationships provide routing/audit context without silently narrowing that standing access. Adjacent-surface participant/privacy details remain an implementation characterization task. | Carl (baseline); Carl/Vivacity (future detail) |
| 12 | Portfolio-scoped staff messaging notification/rights | Depends on item 1's outcome; unstarted. | **Bounded baseline decided 2026-09-09 (ADR-016):** preserve current portfolio-wide internal-staff list/read/reply/assign/resolve behavior until a separately approved narrowing is implemented and verified. | Carl (baseline); Carl/Vivacity (future scope) |
| 13 | Academy-only client users in ordinary messaging/broadcast | Not yet characterized. | **Bounded baseline decided 2026-09-09 (ADR-016):** exclude Academy-only client users from ordinary staff messaging/broadcasts; include only in explicitly named Academy communications. | Carl (baseline); Carl/Vivacity (future implementation) |
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

Per RBAC plan §7 P0.1-P0.3 (`rbac-v6-authorization-implementation-plan-2026-09-01.md:348-378`), P0.1 is a versioned inventory of routes/checks/RPCs/RLS; P0.2 is the permission-mutation/audit-atomicity fix; P0.3 is the shadow `is_active_principal_v6()` rollout. **None of P0.1-P0.3 has started as a tracked implementation packet** — `program-index.md:23` records RBAC v6 as implementation-plan-only, with its §13 policy baseline now agreed for read-only/shadow preparation but no production PR authorized. This packet is not that inventory; it is a bounded citation set sufficient for the P7 gate:

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

## 7. Proven facts vs. policy — recap

Every row in §3-§6 above is labelled **Proven** (source- or live-verified) or
framed as an **Open question** in the 2026-09-09 preparation record. The
cross-cutting runtime fact remains: no production v6 evaluator, capability
catalogue, portfolio scoping, or v6 enforcement cutover exists yet. The dated
policy disposition in §7.2 is the current baseline for read-only/shadow
preparation; it does not authorize implementation or production change.

## 7.1 Baseline vocabulary proposal and bounded staff-read decision

This is a deliberately narrow proposal to make the Phase 3 gate discussable;
it does not approve a role bundle, change a route, or authorize an
enforcement cutover. It records the smallest shared language that the
Super Admin and CSC baseline can use before broader seat policy is settled.
Carl agreed the bounded staff-read baseline on 2026-09-09: preserve current
broad internal-staff tenant read access for now, while sensitive actions are
scoped separately. This is not a final portfolio-scope decision and does not
authorize a production policy change.
Carl also approved the remaining bounded RBAC baseline decisions on
2026-09-09 (ADR-016): the server authority boundary, Super Admin/CSC role
responsibilities, hard-Super-Admin control-plane boundary, temporary-grant
approval and expiry defaults, AJ/CSC pilot scope, disabled-user behavior,
quarterly review ownership, `unicorn-qa` ratification, 14-day shadow
thresholds, portfolio-wide internal-staff messaging, relationship context for
consultant/assistant assignments, and Academy-only communications. These are
characterization and migration-gate decisions only; no production grant or
enforcement change follows from them.

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
41. Those remain characterization cases; the approved pilot scope does not
authorize a production grant or route change. The disabled-user hotfix and the
P7-D session/profile/membership seam are now recorded as implemented in the
Phase 2.6 plan (PR #1079); any future schema/RLS/RPC/Edge changes still require
their own authorized PR and verification.

**Decision status (historical 2026-09-09 record):** The vocabulary and authority
boundary, staff-read compatibility baseline, role responsibilities,
hard-Super-Admin boundary, and the remaining §13 decisions listed above were
approved for read-only/shadow preparation. The current 2026-09-10 disposition
is expanded in §7.2; person-picker/system-account classification and tenant-less
users remain explicitly parked.

## 7.2 Current policy truth-sync (2026-09-10)

Direct Carl/Codex discussion confirmed the following baseline; the full
disposition is maintained in [RBAC v6 §13.1](../../rbac-v6-authorization-implementation-plan-2026-09-01.md#131-current-decision-disposition-2026-09-10).

- Internal staff retain broad cross-tenant read and approved AI-context access
  while work remains overlapping; sensitive writes, destructive actions,
  approvals, exports, configuration, and external sharing are separately
  capability- and scope-controlled. Clients remain own-tenant and
  relationship-scoped.
- CSC consultants and assistants share the same baseline bundle, with an
  optional approved AI-context extension for assistants. Integrator is the
  canonical EOS/KPI operations profile; Team Leader retires into Integrator;
  Team Member is migration-only; CET is retired as an active seat; BGT is
  capability-based; multiple approved profiles per person are allowed.
- Super Admin remains the hard control-plane role. Operational seat subtypes
  describe work but do not bypass that boundary. High-risk grants require two
  approvers; ordinary narrow grants may use one; no self-approval; 30/90-day
  expiry defaults and quarterly review apply.
- Messaging remains participant-private by default, with explicit broad
  internal-staff list/read/reply/assign/resolve capability. Notifications,
  previews, timeline, realtime, and Ask Viv cannot exceed the underlying
  capability. Academy-only client users are excluded from ordinary messaging
  and broadcasts.
- `unicorn-qa` plus the protected P2-QA suite is the standing disposable
  environment/persona process. Shadow mode is 14 days with zero unexplained
  v6-only allows and zero unexplained legacy-allow/v6-deny lockouts; every
  mismatch is reviewed before cutover.
- `/administration/role-permissions` remains an inventory/UX guide. The v6
  model must add profiles/subtypes, scope, relationships, temporary grants,
  approvals, effective-access preview, and audit rather than treating the
  current role-level matrix as authoritative.

## 8. Verification / commands run this session

- `git fetch origin`; `git worktree list` (confirmed the three other in-flight worktrees named in the task and left them untouched).
- `git worktree add -b claude/p7-rbac-tenant-decision-evidence .claude/worktrees/p7-rbac-tenant-decision-evidence origin/main` (branch cut at `461cc5aab`, the merge commit of PR #1049).
- Full reads of the plan/KB files listed in §2.
- Repo-wide `Grep` for `requireSuperAdmin` (7 files, 33 occurrences — see §6).
- Targeted `Grep`/`Read` of the migration files listed in §2 for `is_super_admin_safe`, `is_vivacity_team_safe`, `has_tenant_access_safe`, `check_permission`, confirming each is a Tier-B (repository source), not Tier-A (live), citation.
- One `mcp__supabase__execute_sql` read-only probe (`select current_database(), inet_server_addr()`) was attempted to corroborate the migration-text findings against the live catalog; it was **denied by the auto-mode classifier** in this session. No live database query ran. Every DB-behavior claim above is therefore Tier B only — a future session with live-query authority should re-verify §3 rows 1/3/7 and §4 row 5/9 against live `pg_proc`/`pg_policies` before treating them as Tier A.
- `node scripts/check-kb-links.mjs` — 88 files, 807 local links, 0 broken (2026-09-09 batch).
- `node scripts/check-kb-doc-size.mjs` — 16 files scanned, 0 over the applicable limits (2026-09-09 batch); this file lives under `codebase-optimization/phase-3/` so the 750-line phase-doc ceiling applies.
- `git diff --check` — passed (2026-09-09 batch).

## 9. Historical blockers and recommended sequencing for P7-B/C/D

The following sequencing was accurate for the 2026-09-09 preparation packet and
is retained as historical rationale. As of 2026-09-10, the Phase 2.6
stabilization plan records P7-B, P7-C, and P7-D (including the disabled-user
hotfix and session/profile/membership seam) as implemented through PR #1079;
this section is not an active blocker list.

Per `phase-2-6-stabilization-plan.md:404-422`:

> "Do not begin until P6-A has parity evidence and the RBAC vocabulary decision explicitly says where authorization predicates live."

**P6-A is already closed** (`phase-2-6-stabilization-plan.md:36-37`: "P1-C, P4-A, P4-B, P4-C, P4-D, P6-A and the completed P6-B cohorts are closed") — its parity-evidence half of the gate is satisfied today. The RBAC vocabulary and authority boundary are now approved in ADR-016, so the decision gate for bounded P7-B/P7-C preparation is satisfied. This approval does not authorize implementation or production enforcement.

P7-D carries one additional, separate blocker: the **disabled-user hotfix**, which does not exist anywhere in this repo yet (§3 row 7 — `ProtectedRoute.tsx:51-56`'s fail-open behavior on a `users.disabled` query error is the live defect it must close, and no DB-layer predicate checks `disabled` at all today).

**Recommended sequencing**, given the above:

1. **P7-B/P7-C preparation is unblocked** by the approved vocabulary and authority boundary. P7-B (minimal feature-boundary extraction, keeping the existing `requireSuperAdmin` guard) remains the smallest, lowest-risk slice and its own success measure is "neutral/negative LOC," not a policy change.
2. **P7-C** (the `src/ARCHITECTURE.md` page + scoped lint boundary, confined to the lifecycle pilot) can follow P7-B, since it has no additional decision dependency beyond the shared RBAC vocabulary gate.
3. **P7-D** (auth/profile/membership seam separation) remains blocked on a dedicated disabled-user hotfix PR — fixing `ProtectedRoute.tsx`'s fail-open disabled check and adding a `disabled` check to `check_permission`/`is_super_admin_safe`/`is_vivacity_team_safe` (or their v6 successors) — shipped and verified live. The hotfix is independent of the now-approved vocabulary batch.
4. Independently of P7-B/C/D: TOM §18 item 5 (`tenant_users` vs `tenant_members`, §4 row 5) remains a live dual-source-of-truth condition worth flagging on its own timeline.
5. Carry RBAC §13 items 14/15 and their TOM §18 item 14 counterpart forward as already-parked — do not re-raise them as newly discovered.
