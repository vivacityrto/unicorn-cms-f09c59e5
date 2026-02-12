
-- ============================================================
-- 1. Drop and recreate compute_membership_usage
--    Uses bigint for tenant/client ID (same as tenants.id)
-- ============================================================
DROP FUNCTION IF EXISTS public.compute_membership_usage(bigint);

CREATE OR REPLACE FUNCTION public.compute_membership_usage(p_client_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant RECORD;
  v_tier_label text;
  v_annual_hours numeric;
  v_mem_start date;
  v_year_start timestamptz;
  v_year_end timestamptz;
  v_hours_used numeric;
  v_remaining numeric;
  v_pct numeric;
  v_flags jsonb := '[]'::jsonb;
BEGIN
  -- Get tenant record
  SELECT id, package_id, client_onboarded_at, created_at, status
  INTO v_tenant
  FROM tenants
  WHERE id = p_client_id;

  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('error', 'client_not_found');
  END IF;

  -- Resolve tier from global config via package_id
  SELECT tier_label, annual_included_hours
  INTO v_tier_label, v_annual_hours
  FROM membership_tier_capacity_config
  WHERE v_tenant.package_id = ANY(package_ids);

  IF v_tier_label IS NULL THEN
    v_tier_label := 'Unknown';
    v_annual_hours := 0;
  END IF;

  -- Membership year start: use client_onboarded_at or created_at
  v_mem_start := COALESCE(v_tenant.client_onboarded_at, v_tenant.created_at)::date;

  -- Calculate current membership year window
  -- Find anniversary that defines the current year
  IF (v_mem_start + ((EXTRACT(YEAR FROM now())::int - EXTRACT(YEAR FROM v_mem_start)::int) * interval '1 year')) > now() THEN
    v_year_start := (v_mem_start + ((EXTRACT(YEAR FROM now())::int - EXTRACT(YEAR FROM v_mem_start)::int - 1) * interval '1 year'))::timestamptz;
  ELSE
    v_year_start := (v_mem_start + ((EXTRACT(YEAR FROM now())::int - EXTRACT(YEAR FROM v_mem_start)::int) * interval '1 year'))::timestamptz;
  END IF;
  v_year_end := v_year_start + interval '1 year';

  -- Sum billable hours from time_entries within membership year
  SELECT COALESCE(SUM(duration_minutes / 60.0), 0)
  INTO v_hours_used
  FROM time_entries
  WHERE client_id = p_client_id
    AND start_at >= v_year_start
    AND start_at < v_year_end
    AND is_billable = true;

  v_hours_used := ROUND(v_hours_used, 2);
  v_remaining := ROUND(GREATEST(v_annual_hours - v_hours_used, 0), 2);

  -- Percent utilised
  IF v_annual_hours > 0 THEN
    v_pct := ROUND((v_hours_used / v_annual_hours) * 100, 1);
  ELSE
    v_pct := NULL;
  END IF;

  -- Status flags
  IF v_annual_hours = 0 THEN
    v_flags := v_flags || '"no_included_hours"'::jsonb;
  END IF;
  IF v_pct IS NOT NULL AND v_pct >= 75 AND v_pct < 90 THEN
    v_flags := v_flags || '"utilised_75"'::jsonb;
  END IF;
  IF v_pct IS NOT NULL AND v_pct >= 90 AND v_hours_used <= v_annual_hours THEN
    v_flags := v_flags || '"utilised_90"'::jsonb;
  END IF;
  IF v_annual_hours > 0 AND v_hours_used > v_annual_hours THEN
    v_flags := v_flags || '"overage"'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'tier_name', v_tier_label,
    'included_hours_annual', v_annual_hours,
    'membership_start_date', v_year_start::date,
    'membership_end_date', v_year_end::date,
    'hours_used_in_year', v_hours_used,
    'hours_remaining', v_remaining,
    'percent_utilised', v_pct,
    'status_flags', v_flags
  );
END;
$$;

-- ============================================================
-- 2. Client membership usage view (tenant-scoped)
-- ============================================================
CREATE OR REPLACE VIEW public.vw_client_membership_usage
WITH (security_invoker = true)
AS
SELECT
  t.id AS tenant_id,
  t.id AS client_id,
  t.name AS client_name,
  mc.tier_label AS tier_name,
  COALESCE(mc.annual_included_hours, 0) AS included_hours_annual,
  COALESCE(t.client_onboarded_at, t.created_at)::date AS membership_start_date,
  (COALESCE(t.client_onboarded_at, t.created_at)::date + interval '1 year')::date AS membership_end_date,
  (u.usage->>'hours_used_in_year')::numeric AS hours_used_in_year,
  (u.usage->>'hours_remaining')::numeric AS hours_remaining,
  (u.usage->>'percent_utilised')::numeric AS percent_utilised,
  u.usage->'status_flags' AS flags
FROM tenants t
LEFT JOIN membership_tier_capacity_config mc ON t.package_id = ANY(mc.package_ids)
CROSS JOIN LATERAL (
  SELECT compute_membership_usage(t.id) AS usage
) u
WHERE t.status = 'active';

-- ============================================================
-- 3. Update the RPC wrapper to use the new function
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_get_membership_usage(p_tenant_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_vivacity_team_safe(auth.uid()) THEN
    -- Check if caller is a member of this tenant
    IF NOT EXISTS (
      SELECT 1 FROM tenant_members
      WHERE tenant_id = p_tenant_id AND user_id = auth.uid() AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Access denied';
    END IF;
  END IF;

  RETURN compute_membership_usage(p_tenant_id);
END;
$$;
