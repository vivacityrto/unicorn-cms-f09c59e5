-- Latest-per-stage-instance view over stage_health_snapshots currently
-- runs as the owner (security_invoker unset / false), so SELECT bypasses
-- the base table's tenant RLS (has_tenant_access_safe). Anon also held a
-- default GRANT SELECT. Flip to invoker mode and revoke anon.
--
-- Sole in-repo caller is ask-viv-assistant get_stage_health_hotspots,
-- which uses the service-role client (bypasses RLS either way).
-- Verified 2026-08-15 via rolled-back dry-run: authenticated SELECT no
-- longer permission-denies; anon is denied; owner rowcount unchanged.

ALTER VIEW public.v_stage_health_latest SET (security_invoker = true);

REVOKE ALL ON public.v_stage_health_latest FROM anon;

COMMENT ON VIEW public.v_stage_health_latest IS
  'Latest stage_health_snapshots row per stage_instance_id — current health only, not the full history. security_invoker=true so SELECT respects stage_health_snapshots RLS (has_tenant_access_safe). Read via service-role callers (e.g. ask-viv-assistant) or authenticated users with tenant access. Anon has no grant.';

NOTIFY pgrst, 'reload schema';
