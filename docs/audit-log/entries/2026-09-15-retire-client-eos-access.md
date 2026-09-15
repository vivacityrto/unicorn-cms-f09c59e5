# Audit: 2026-09-15 — Retire client-tenant access to EOS

**Trigger:** ad-hoc, surfaced during RBAC v6 P1-e review-ask discussion
**Scope:** RLS policies and helper functions governing `/eos/*` tables (all tables checked for a client-tenant-reachable access path); did not touch `eos_configurations`/`eos_configuration_segments` (already internal-only, see Findings), Academy, TOM, or any other initiative's tables

## Findings

- While verifying `eos.scorecard.manage`/`eos.rocks.own.manage` for RBAC v6 P1-e's tenant/relationship classification, discovered the EOS *frontend* already fully blocks client-tenant users (dedicated `eos:access` permission, tested, "Vivacity Team only") — but the *database* layer did not match: `eos_scorecard`, `eos_scorecard_entries`, `eos_scorecard_metrics`, `eos_rocks`, `eos_todos`, and `eos_vto` all had RLS policies granting real access to any client-tenant user, through several different mechanisms:
  - `has_any_eos_role(uid, tenant_id)` / `can_facilitate_eos(uid, tenant_id)` — backed by `eos_user_roles`, which had 384 rows across 377 tenants, **all inserted at the exact same timestamp (2026-01-06 01:37:04, role `participant`, `assigned_by` NULL)** — a bulk backfill, not real client onboarding.
  - A raw `tenant_id = get_current_user_tenant()` clause with **no role check at all**, baked directly into policies on `eos_rocks` (delete/insert/update), `eos_todos` (all 4 ops), and `eos_vto` (insert/update).
  - `has_tenant_access_safe(client_tenant_id, uid)` on `eos_rocks`'s SELECT policy (any active tenant member).
  - `eos_vto`'s SELECT policy additionally had `tenant_id IN (SELECT users.tenant_id FROM users WHERE user_uuid = auth.uid())` — a fourth variant of the same pattern.
  - `eos_scorecard`'s own direct `tenant_id = get_current_user_tenant() AND get_current_user_role() = 'Admin'` clause — `'Admin'` is the single most common `unicorn_role` value in the system (457 users), i.e. effectively every client-company admin.
- Confirmed via data, not just policy text: every row of real EOS content across all of `eos_rocks` (134 rows), `eos_scorecard` (2 rows), `eos_configurations` (4 rows), and `eos_vto` (4 rows) belongs exclusively to tenant `6372` ("Vivacity Coaching & Consulting" — Vivacity's own internal tenant record). Two `eos_vto`/`eos_scorecard` rows referenced tenant IDs (111, 319) that no longer exist in `public.tenants` at all. No real client tenant has ever used this feature.
- Vivacity's own tenant (`6372`) has zero rows in `eos_user_roles` — its own access already flows entirely through `is_vivacity_team_user()`/`is_super_admin()`, independent of the table being emptied.
- `eos_configurations`/`eos_configuration_segments` were checked and are **not** part of this exposure: their RLS routes through `has_permission('eos.configurations.manage', 'full')`, and `role_permissions` only has rows for internal `unicorn_role` values (BGT/CET/CSC/Integrator/Super Admin/Team Leader) for that key — no client-tenant role can ever satisfy it. Left unchanged.
- Carl was not aware clients had any path to EOS and directed retiring the client-tenant access path now (the product is mid-foundation-building), while keeping it easy to re-expand later rather than a hard deletion of the underlying mechanism.

## Code changes (this entry accompanies one)

- Migration `20260915004558_retire_client_eos_access` (applied directly via Supabase MCP `apply_migration`, then committed to this repo for history):
  - `has_any_eos_role`/`can_facilitate_eos` now additionally require `_tenant_id = 6372` (defense-in-depth; the table cleanup below already makes them return false everywhere, but this survives a future accidental re-seed).
  - 16 policies rewritten across `eos_rocks`, `eos_todos`, `eos_vto`, `eos_scorecard` (all 4 CRUD ops on the first three, all 4 on the last minus the untouched `eos_vto` delete policy which had no raw clause) to remove every client-tenant-reachable clause identified above, while preserving each table's existing internal-Vivacity/owner/assignee semantics unchanged (`is_super_admin()`, `is_vivacity_team_user()`/`is_vivacity_team_safe()`, `owner_id = auth.uid()` on `eos_rocks`, `assigned_to = auth.uid()` on `eos_todos`).
  - `DELETE FROM public.eos_user_roles` — removed all 384 unused bulk-seeded rows (verified zero effect on Vivacity's own access, per the finding above).
- Verified post-migration: `eos_user_roles` is empty; a follow-up query for the raw clauses (`get_current_user_tenant`, `has_tenant_access_safe`, `users.tenant_id`) across the four tables' policies returned zero rows; policy count on the four tables unchanged (16), confirming no policy was dropped without a replacement.

## Decisions

- Client-tenant access to EOS is retired, not permanently removed — re-expanding later means adding real, deliberate `eos_user_roles` rows and reviewing the function/policy gates again, not restoring dead code.
- `eos_configurations` intentionally left untouched (already safe by construction).

## Open questions parked

- Whether the two orphaned `eos_vto`/`eos_scorecard` rows (tenant IDs 111, 319, no longer in `public.tenants`) should be cleaned up separately — not part of this retirement, noted for later.

## Correction (same day, 2026-09-15) — a table was missed in the original pass

While drafting the RBAC v6 P1-w golden-matrix packet for `eos.scorecard.manage`
(the approved first vertical slice), found that `eos_scorecard_metrics` was
**not** covered by the original migration above. It has its own independent
`EXISTS (SELECT 1 FROM eos_scorecard sc WHERE sc.id = eos_scorecard_metrics.scorecard_id
AND sc.tenant_id = get_current_user_tenant() AND get_current_user_role() = 'Admin')`
clause on all 4 CRUD policies — the same client-tenant-'Admin' pattern as
`eos_scorecard` itself, but expressed independently rather than through
`has_any_eos_role`/`can_facilitate_eos`, so the original function patch did
not close it. Re-checked `eos_scorecard_entries` at the same time and
confirmed it has no equivalent raw clause (it only ever routed through the
already-patched functions) — no further gap found there.

Fixed via migration `20260915012553_retire_client_eos_access_scorecard_metrics_followup`
(applied via Supabase MCP, same pattern as the original fix): all 4
`eos_scorecard_metrics` policies rewritten to `is_super_admin() OR
is_vivacity_team_user(...)` only. Verified post-fix via direct `pg_policies`
query. No other table re-checked this pass showed a similar miss.
