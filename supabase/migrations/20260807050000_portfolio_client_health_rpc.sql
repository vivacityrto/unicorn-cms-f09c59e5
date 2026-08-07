-- The MainDashboard's Client Health widget was extended to fall back to a
-- portfolio-wide (all active clients) view for staff with no assigned
-- clients, plus a Mine/Portfolio toggle for CSCs to view it on demand.
-- Implemented first as a plain client-side query against
-- v_dashboard_attention_ranked with the tenant filter removed — that query
-- is fine for a service-role/superuser context (verified via direct SQL:
-- 56 active tenants, 1 healthy/5 monitoring/50 critical), but under the
-- authenticated role it re-evaluates the tenants RLS policy
-- (app.user_can_access_tenant, itself doing a subquery) once per row on top
-- of several expensive LATERAL joins per tenant (risk_events,
-- stage_health_snapshots, client_action_items, evidence_gap_checks,
-- time_entries, tenant_package_burn_forecast, tenant_retention_forecasts) —
-- confirmed via postgres logs as repeated "canceling statement due to
-- statement timeout" errors, surfacing as a 500 to the client and an empty
-- "No client data" state, not the intended fallback.
--
-- Fix: a SECURITY DEFINER RPC that computes just the four aggregate counts
-- needed for the donut, bypassing RLS via `SET row_security = 'off'` (same
-- pattern already used by is_super_admin_safe/is_vivacity_team_safe in this
-- schema) so the expensive per-row tenant-access check never runs — the
-- caller's own staff-membership check replaces it, and only aggregate counts
-- are returned, no raw per-tenant data.
CREATE OR REPLACE FUNCTION public.rpc_portfolio_client_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
SET row_security = 'off'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RETURN jsonb_build_object('healthy', 0, 'monitoring', 0, 'at_risk', 0, 'critical', 0, 'total', 0);
  END IF;

  SELECT jsonb_build_object(
    'healthy', count(*) FILTER (WHERE worst_stage_health_status = 'healthy'),
    'monitoring', count(*) FILTER (WHERE worst_stage_health_status = 'monitoring'),
    'at_risk', count(*) FILTER (WHERE worst_stage_health_status = 'at_risk'),
    'critical', count(*) FILTER (WHERE worst_stage_health_status = 'critical'),
    'total', count(*)
  ) INTO v_result
  FROM public.v_dashboard_attention_ranked
  WHERE tenant_status = 'active';

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_portfolio_client_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_portfolio_client_health() TO authenticated;
