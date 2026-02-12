
-- Fix compute_client_weekly_required to use package_instances
CREATE OR REPLACE FUNCTION public.compute_client_weekly_required(p_tenant_id bigint)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant RECORD;
  v_tier_hours numeric;
  v_weeks_since numeric;
  v_multiplier numeric;
  v_membership_package_id bigint;
BEGIN
  SELECT id, client_onboarded_at, created_at, status
  INTO v_tenant
  FROM tenants
  WHERE id = p_tenant_id;

  IF v_tenant IS NULL OR v_tenant.status != 'active' THEN
    RETURN 0;
  END IF;

  -- Resolve membership package from active package_instances
  SELECT pi.package_id INTO v_membership_package_id
  FROM package_instances pi
  JOIN membership_tier_capacity_config mtcc ON pi.package_id = ANY(mtcc.package_ids)
  WHERE pi.tenant_id = p_tenant_id
    AND pi.is_complete = false
  ORDER BY mtcc.weekly_required_hours DESC
  LIMIT 1;

  IF v_membership_package_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT weekly_required_hours INTO v_tier_hours
  FROM membership_tier_capacity_config
  WHERE v_membership_package_id = ANY(package_ids);

  IF v_tier_hours IS NULL THEN
    RETURN 0;
  END IF;

  v_weeks_since := EXTRACT(EPOCH FROM (now() - COALESCE(v_tenant.client_onboarded_at, v_tenant.created_at))) / 86400.0;

  IF v_weeks_since <= 28 THEN v_multiplier := 2.0;
  ELSIF v_weeks_since <= 56 THEN v_multiplier := 1.5;
  ELSE v_multiplier := 1.0;
  END IF;

  RETURN ROUND(v_tier_hours * v_multiplier, 2);
END;
$$;

-- Fix compute_membership_usage to use package_instances
CREATE OR REPLACE FUNCTION public.compute_membership_usage(p_client_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant RECORD;
  v_membership_package_id bigint;
  v_tier_label text;
  v_annual_hours numeric;
  v_start date;
  v_end date;
  v_hours_used numeric;
  v_hours_remaining numeric;
  v_pct numeric;
  v_flags jsonb := '[]'::jsonb;
  v_now date := current_date;
  v_year_offset int;
BEGIN
  SELECT id, client_onboarded_at, created_at, status
  INTO v_tenant
  FROM tenants
  WHERE id = p_client_id;

  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('error', 'tenant_not_found');
  END IF;

  SELECT pi.package_id INTO v_membership_package_id
  FROM package_instances pi
  JOIN membership_tier_capacity_config mtcc ON pi.package_id = ANY(mtcc.package_ids)
  WHERE pi.tenant_id = p_client_id
    AND pi.is_complete = false
  ORDER BY mtcc.annual_included_hours DESC
  LIMIT 1;

  IF v_membership_package_id IS NULL THEN
    RETURN jsonb_build_object(
      'tier_name', 'No Membership',
      'included_hours_annual', 0,
      'membership_start_date', null,
      'membership_end_date', null,
      'hours_used_in_year', 0,
      'hours_remaining', 0,
      'percent_utilised', null,
      'flags', '["no_included_hours"]'::jsonb
    );
  END IF;

  SELECT tier_label, annual_included_hours
  INTO v_tier_label, v_annual_hours
  FROM membership_tier_capacity_config
  WHERE v_membership_package_id = ANY(package_ids);

  v_start := COALESCE(v_tenant.client_onboarded_at, v_tenant.created_at)::date;
  v_year_offset := EXTRACT(YEAR FROM age(v_now, v_start))::int;
  v_start := v_start + (v_year_offset * interval '1 year')::interval;
  v_end := v_start + interval '1 year' - interval '1 day';

  SELECT ROUND(COALESCE(SUM(duration_minutes / 60.0), 0), 2)
  INTO v_hours_used
  FROM time_entries
  WHERE tenant_id = p_client_id
    AND start_at >= v_start
    AND start_at < (v_end + interval '1 day');

  v_hours_remaining := ROUND(GREATEST(v_annual_hours - v_hours_used, 0), 2);
  v_pct := CASE WHEN v_annual_hours > 0 THEN ROUND((v_hours_used / v_annual_hours) * 100, 1) ELSE NULL END;

  IF v_annual_hours = 0 THEN v_flags := v_flags || '"no_included_hours"'::jsonb; END IF;
  IF v_pct IS NOT NULL AND v_pct >= 75 AND v_pct < 90 THEN v_flags := v_flags || '"utilised_75"'::jsonb; END IF;
  IF v_pct IS NOT NULL AND v_pct >= 90 AND v_hours_used <= v_annual_hours THEN v_flags := v_flags || '"utilised_90"'::jsonb; END IF;
  IF v_pct IS NOT NULL AND v_hours_used > v_annual_hours AND v_annual_hours > 0 THEN v_flags := v_flags || '"overage"'::jsonb; END IF;

  RETURN jsonb_build_object(
    'tier_name', v_tier_label,
    'included_hours_annual', v_annual_hours,
    'membership_start_date', v_start,
    'membership_end_date', v_end,
    'hours_used_in_year', v_hours_used,
    'hours_remaining', v_hours_remaining,
    'percent_utilised', v_pct,
    'flags', v_flags
  );
END;
$$;
