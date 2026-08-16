# Audit: 2026-08-15 — v_stage_health_latest respects RLS

**Trigger:** ad-hoc
**Scope:** One view (`public.v_stage_health_latest`). No table, trigger,
function, or data changes. Did not review other security_definer views.

## Findings

- `v_stage_health_latest` was created 2026-08-04
  (`ask_viv_assistant_stage_health_latest_view`) as a `DISTINCT ON`
  wrapper over `stage_health_snapshots`. Live `reloptions` was `NULL`
  (security_invoker default / false), so SELECT ran as the view owner
  (`postgres`) and bypassed the base table's tenant RLS
  (`stage_health_snapshots_select_tenant` →
  `has_tenant_access_safe(tenant_id, auth.uid())`).
- The view definition is a single-table `DISTINCT ON` — no
  `auth.sessions` (or other privileged-schema) join, so this is not the
  `v_client_tenant_users` failure shape from
  `2026-08-06-cursor-security-migrations-reconciliation`.
- Default grants included `SELECT` (and the rest of ALL) for `anon`,
  `authenticated`, and `service_role`. Combined with owner-mode
  execution, any anon/authenticated PostgREST caller could read current
  stage health for all 345 tenants (4,153 latest rows).
- Sole in-repo caller is Ask Viv Assistant's `get_stage_health_hotspots`
  (`supabase/functions/ask-viv-assistant/index.ts`), which uses
  `createServiceClient` (service_role). Service-role bypasses RLS either
  way, so invoker mode does not change that tool's result set.

## KB changes shipped

- no changes

## Code changes (if this entry accompanies one)

- Applied `v_stage_health_latest_security_invoker` (version
  `20260815080456`) to hosted project `yxkgdalkbrriasiyyrwk` via
  Supabase MCP `apply_migration`.
- `supabase/migrations/20260815080456_v_stage_health_latest_security_invoker.sql`
  — `ALTER VIEW ... SET (security_invoker = true)`, `REVOKE ALL ... FROM
  anon`, catalog comment update, `NOTIFY pgrst, 'reload schema'`.

## Decisions

- Applied the supplied DDL as written, plus a `COMMENT ON VIEW` so the
  catalog no longer claims the view is "not RLS-gated separately".
- Left `authenticated` and `service_role` grants in place. Authenticated
  callers now see only rows their `stage_health_snapshots` RLS allows;
  service_role (Ask Viv) is unchanged.
- Did not wrap the view in a SECURITY DEFINER RPC. Unlike
  `v_client_tenant_users`, this view has no privileged-schema join and
  the product intent is tenant-scoped health, which matches the base
  table's existing RLS.

## Open questions parked

- Default ALL grants (INSERT/UPDATE/DELETE/TRUNCATE/…) remain on the
  view for `authenticated` and `service_role`. Views are not writable
  here, but the leftover ALL grant is the same default-grant residue
  other security_invoker migrations left in place.
