-- /executive and /admin/strategic-command have been 403ing on 5 of their 6
-- data sources. Root cause: they ultimately read from materialized views
-- (mv_compliance_score_daily_30d underneath the 3 executive views;
-- v_strategic_portfolio_risk and v_strategic_capacity_pressure ARE
-- materialized views themselves), and Postgres materialized views cannot
-- have row-level security. `authenticated` already had SELECT on the 3
-- regular executive views, but the security_invoker=true views need the
-- CALLING user's own privilege on every object in the chain -- including
-- the underlying matview, which was never granted.
--
-- The naive fix (GRANT SELECT to authenticated on the matviews) would
-- work for staff but also auto-exposes them as direct PostgREST endpoints
-- to every authenticated user, including client portal accounts -- with
-- no RLS possible on a matview, that means any logged-in user could pull
-- every tenant's compliance/risk/capacity data directly. These dashboards
-- are cross-tenant BY DESIGN for internal leadership (sidebar gates
-- Executive Dashboard as leadershipOnly = Super Admin or Team Leader;
-- Strategic Command Centre as Super Admin only) -- the right shape is a
-- SECURITY DEFINER RPC that checks role before returning data, same
-- pattern as get_user_audit/list_code_tables, not a table-level grant.
--
-- v_executive_watchlist_7d is untouched -- it doesn't depend on the
-- broken matview and already works.

CREATE OR REPLACE FUNCTION public.get_executive_client_health()
RETURNS SETOF public.v_executive_client_health
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_team_leader_or_above(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: Team Leader or above required';
  END IF;
  RETURN QUERY SELECT * FROM public.v_executive_client_health ORDER BY operational_risk_score DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_executive_client_health() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_executive_anomalies_30d()
RETURNS SETOF public.v_executive_anomalies_30d
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_team_leader_or_above(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: Team Leader or above required';
  END IF;
  RETURN QUERY SELECT * FROM public.v_executive_anomalies_30d ORDER BY anomaly_rank ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_executive_anomalies_30d() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_executive_consultant_distribution()
RETURNS SETOF public.v_executive_consultant_distribution
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_team_leader_or_above(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: Team Leader or above required';
  END IF;
  RETURN QUERY SELECT * FROM public.v_executive_consultant_distribution ORDER BY immediate_count DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_executive_consultant_distribution() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_strategic_portfolio_risk()
RETURNS SETOF public.v_strategic_portfolio_risk
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: Super Admin only';
  END IF;
  RETURN QUERY SELECT * FROM public.v_strategic_portfolio_risk;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_strategic_portfolio_risk() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_strategic_capacity_pressure()
RETURNS SETOF public.v_strategic_capacity_pressure
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: Super Admin only';
  END IF;
  RETURN QUERY SELECT * FROM public.v_strategic_capacity_pressure ORDER BY capacity_utilisation_percentage DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_strategic_capacity_pressure() TO authenticated;

-- Discovered incidentally while verifying the above live: v_exec_alignment_signals_7d
-- (Executive Dashboard's Alignment Signals panel) has the exact same root cause
-- (depends on mv_compliance_score_daily_30d) and wasn't caught by the original
-- audit pass. Same fix, same gate (leadershipOnly = Super Admin or Team Leader).
CREATE OR REPLACE FUNCTION public.get_exec_alignment_signals_7d()
RETURNS SETOF public.v_exec_alignment_signals_7d
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_team_leader_or_above(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: Team Leader or above required';
  END IF;
  RETURN QUERY SELECT * FROM public.v_exec_alignment_signals_7d ORDER BY priority_rank ASC LIMIT 20;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_exec_alignment_signals_7d() TO authenticated;
