# Audit: 2026-09-11 — tenant package/dashboard security fixes

**Trigger:** ad-hoc — findings surfaced during Tenant Operating Model P0.1
evidence work (PR #1182), independently re-verified live before fixing.
**Scope:** live grants and `SECURITY DEFINER` function bodies for
`v_client_package_dashboard`, `v_package_burndown`, `start_client_package`,
`transition_membership_state`, `get_tenant_user_capacity`. Did not touch any
other TOM P0.1 evidence surface, and did not touch production data.

## Findings

- `v_client_package_dashboard`: no tenant predicate on its final `SELECT`
  (aggregate CTEs each filtered on `app.user_can_access_tenant()`, but the
  top-level query joining `package_instances`/`packages` did not, and the
  CTEs were `LEFT JOIN`ed so a row with no matching CTE rows still passed
  through). Grants: `SELECT` to **`anon`** (unauthenticated) and
  `authenticated` — a genuine unauthenticated cross-tenant read. Zero
  legitimate frontend callers of the raw view; the real consumer
  (`use-client-package-dashboard.ts`) already calls the safe
  `get_client_package_dashboard` RPC.
- `v_package_burndown`: same no-tenant-filter shape, `SELECT` granted to
  `authenticated`. Three real frontend callers query it directly with only a
  client-supplied `.eq('tenant_id', ...)` filter, which provides no real
  security since a caller can omit or forge it: `TenantTimeTrackerBar.tsx`,
  `ClientTimeTab.tsx`, and `RenewalConfirmDialog.tsx` (the last of these had
  no tenant filter at all).
- `start_client_package(p_tenant_id, p_package_id, p_assigned_csc_user_id)`
  and `transition_membership_state(p_instance_id, p_new_state, p_reason)`:
  both `SECURITY DEFINER`, `EXECUTE` granted to `authenticated`, zero
  authorization check in either body — any authenticated caller could start
  a package or transition membership state for any tenant.
- `get_tenant_user_capacity(p_tenant_id, p_caller_id DEFAULT NULL)`: accepted
  a caller-supplied `p_caller_id` that overrode `auth.uid()` in its own
  access check — an identity-spoofing bypass. `EXECUTE` granted to `PUBLIC`,
  `anon`, and `authenticated`. No frontend caller ever passed `p_caller_id`
  (confirmed via `useUserCapacity.ts`).

## Code changes (this entry accompanies)

- `supabase/migrations/20260911210000_fix_tenant_isolation_gaps_package_dashboard_burndown.sql`
  (applied live via `mcp__supabase__apply_migration`, then verified against
  live grants):
  - `REVOKE SELECT ON v_client_package_dashboard FROM anon, authenticated;`
  - New `get_package_burndown(p_tenant_id, p_package_instance_ids)` RPC,
    `SECURITY DEFINER` + `SET row_security TO 'off'`, gated by
    `app.user_can_access_tenant(p_tenant_id)`, mirroring
    `get_client_package_dashboard`'s existing safe pattern. `EXECUTE` granted
    to `authenticated` only (`PUBLIC`/`anon` explicitly revoked — Postgres
    grants `EXECUTE` to `PUBLIC` by default on `CREATE FUNCTION`, caught and
    corrected before merge).
  - `REVOKE SELECT ON v_package_burndown FROM authenticated;`
  - Added `app.user_can_access_tenant()` checks to `start_client_package`
    (first statement in the body) and `transition_membership_state` (after
    deriving `v_tenant_id` from `p_instance_id`, before the `UPDATE`) — both
    bodies otherwise byte-identical to the live definitions.
  - `get_tenant_user_capacity`: `DROP FUNCTION` (arity change) then recreated
    with a single `p_tenant_id` parameter, `v_caller uuid := auth.uid()`
    (no more caller-supplied override). `EXECUTE` revoked from `PUBLIC`/
    `anon`, kept for `authenticated`.
- `src/components/client/TenantTimeTrackerBar.tsx`,
  `src/components/client/ClientTimeTab.tsx`,
  `src/components/client/RenewalConfirmDialog.tsx`: migrated from
  `supabase.from('v_package_burndown')` to
  `supabase.rpc('get_package_burndown', ...)`.
- `src/integrations/supabase/types.ts`: regenerated
  (`mcp__supabase__generate_typescript_types`) to reflect the new/changed RPC
  signatures.

## Decisions

- All four fixes authorized by Carl ("proceed on all four") after
  independent live re-verification of each finding (grants,
  `pg_get_viewdef`/`pg_get_functiondef`, real caller reachability) by both
  Claude and Codex.
- Scoped to the reported objects only — did not attempt a broader sweep of
  other views/functions for the same class of gap in this same change.

## Open questions parked

- `v_client_package_dashboard` and `v_package_burndown` both also carry
  `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`/`REFERENCES`/`TRIGGER` grants for
  `anon`/`authenticated` (pre-existing, not part of the reported findings,
  not touched by this fix). Both views join multiple tables and aggregate,
  so they are not Postgres auto-updatable views and these grants appear
  inert in practice — but a repo-wide sweep for this same default-grant
  pattern on other views was not performed here and may be worth a separate,
  explicitly scoped pass.
- A broader search for other `SECURITY DEFINER` functions with a similar
  "no authorization check in body" gap was not performed — this fix is
  scoped to the four objects Codex's TOM P0.1 evidence work specifically
  surfaced.
