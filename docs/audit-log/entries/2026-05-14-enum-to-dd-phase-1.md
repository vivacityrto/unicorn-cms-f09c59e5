# Audit: 2026-05-14 — enum-to-dd Phase 1 progress

**Trigger:** Lovable production DB change session — Phase 1 enum-to-`dd_` rollout (unused and low-risk enums).
**Author:** Khian (Brian)
**Scope:** Phase 1 sub-phases only: Phase 1A (`feature_flag`), Phase 1B (`meeting_type`, `rock_type`, `stage_state`, `task_status`), Phase 1A-C (`invite_status` — skipped), Phase 1B-C (`tenant_role` — legacy cleanup). Phase 1C-C (`vivacity_role`) not yet started. Out of scope: Phase 2 (already closed in `2026-05-13-enum-to-dd-phase-2.md`), Phase 3 notification enums, Phase 4 role/access enums, Phase 5 EOS/workflow enums.
**Supabase project:** `yxkgdalkbrriasiyyrwk` — Unicorn 2.0-dev

---

## Findings

### Phase 1A — `feature_flag` (complete)
- `dd_feature_flag` created, seeded with `eos_qc` / `EOS QC`, RLS enabled. Legacy `feature_flag` enum retained for rollback safety.

### Phase 1B — `meeting_type`, `rock_type`, `stage_state`, `task_status` (complete)
- `dd_meeting_type` created, seeded with `level_10`, `quarterly`, `annual`. RLS enabled. Legacy enum retained.
- `dd_rock_type` created, seeded with `company`, `team`, `individual`. RLS enabled. Legacy enum retained.
- `dd_stage_state` created, seeded with `not_started`, `active`, `blocked`, `complete`, `not_applicable`. RLS enabled. Legacy enum retained.
- `dd_task_status` created, seeded with `backlog`, `not_started`, `in_progress`, `blocked`, `completed`, `cancelled`. RLS enabled. Legacy enum retained.
- All four enums confirmed as having no active table-column usage before migration.

### Phase 1A-C — `invite_status` (skipped)
- Decision: values (`INVITED`, `ACCEPTED`, `REVOKED`, `EXPIRED`) are stable and self-contained. Converting to a lookup table adds complexity without operational benefit. No migration applied.

### Phase 1B-C — `tenant_role` (complete — expanded scope)
- Initial scope: simple enum-to-`dd_` conversion.
- Revised scope after discovery: `tenant_role` enum was orphaned (no column typed as it). `users.tenant_role` column was a ghost — storing `'user'` for all 502 rows since the RBAC migration in January 2026. System had already migrated to `tenant_members.role` as the active role system. Seven RLS policies on accountability tables and `eos_alerts` were checking `users.tenant_role = 'Admin'` — a value that never existed — silently denying tenant admin access since January 2026. `doc_files` RLS policy had a casing bug (`'admin'` vs `'Admin'`).
- Two-part migration delivered:
  - Part 1 (edge functions): removed `tenant_role` from `.select()` in `invite-user` and `resend-invite` edge functions; removed dead `checkTenantAdmin()` function from `auth-helpers.ts`.
  - Part 2 (DB): `dd_tenant_role` created and seeded with `'Admin'` / `'General User'` (byte-identical to `tenant_members.role` live values); 7 accountability RLS policies rewritten to use `is_vivacity_team_safe()` OR `tenant_members` check (tenant admins now correctly get access to accountability tables); `doc_files` casing bug fixed; dead 2-arg `is_tenant_admin(_user_id, _tenant_id)` function dropped; `users.tenant_role` data archived to `archive.users_tenant_role_legacy` then column dropped; orphan `tenant_role` enum archived to `archive.tenant_role` then dropped from `public`.
- Part 2 migration file: `20260514020533_7dcc2db7-4ab4-40db-8d0a-509607401a93.sql`.
- All 11 post-deploy verification checks passed: `dd_tenant_role` = 2 rows, column dropped, public enum dropped, archive enum present, 2-arg function dropped, 1-arg function retained, zero policies still reference `tenant_role`, 502 archived rows, 502 users intact, 419 active Admin / 58 active General User in `tenant_members` unchanged.

### `tenant_members.role` audit (complete — out of enum migration scope)
- Audited as a follow-on after Phase 1B-C. Column is the active role system, CHECK constraint correctly enforcing `'Admin'` / `'General User'`. No FK to `dd_tenant_role` added — CHECK constraint handles validation; FK deferred until a role management UI queries `dd_tenant_role` directly.
- Three bugs surfaced and logged in `BugOrganisation.md`:
  - BUG-033: `is_super_admin_member()` checks `role LIKE 'SUPER_ADMIN%'` — always false; dead code.
  - BUG-034: `admin_fix_memberships()` inserts `unicorn_role` directly as `tenant_members.role` — violates CHECK constraint in non-dry-run mode; Lovable prompt prepared.
  - BUG-035: `invite_user()` SQL RPC validates `'User'` not `'General User'` — confirmed dead code, never called from frontend or edge functions.

### enumtodd skill updated
- Phase 1 discovery missed that `users.tenant_role` stores only `'user'` for all rows — enum orphaned but column active with inconsistent data. Skill updated with mandatory critical discovery checks: sample actual stored data, read function logic in full, parse RLS policies in detail, cross-reference enum labels against live data. Safety Rule #11 added. Carl's archive rule (dead objects → `archive` schema) added to Safety Rule #3.

---

## KB changes shipped

- no KB changes committed this session — `EnumToDdInventory.md` and `BugOrganisation.md` are in the workspace root outside tracked sub-repos; updates were made in-place.

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5` @ `84b9c7ab`: Phase 1A, 1B, and 1B-C migrations present on `main`. Edge function patches for `invite-user`, `resend-invite`, and `auth-helpers.ts` confirmed in diff.

## Decisions

- Phase 1A-C (`invite_status`) skipped — stable values, no operational benefit.
- `dd_tenant_role` seeded from `tenant_members.role` actual values (`Admin`, `General User`), not from orphan enum labels (`ADMIN`, `GENERAL_USER`).
- Dead database objects archived to `archive` schema rather than dropped directly (Carl's rule — locked in `EnumToDdInventory.md` Decision #7).
- No FK from `tenant_members.role` to `dd_tenant_role` — CHECK constraint is the active enforcer; FK deferred until role management UI is built.
- Phase 1C-C (`vivacity_role`) is the next enum migration target.

## Open questions parked

- BUG-034 (`admin_fix_memberships()` role mapping) — Lovable prompt prepared, fix before platform goes live.
- BUG-033 + BUG-035 — dead SQL functions; archive to `archive` schema when convenient.
- Phase 1C-C (`vivacity_role`) — not yet started.
- `tenant_members.role` FK to `dd_tenant_role` — deferred until role management UI queries `dd_tenant_role` directly.

## Tag

`audit-2026-05-14-enum-to-dd-phase-1`
