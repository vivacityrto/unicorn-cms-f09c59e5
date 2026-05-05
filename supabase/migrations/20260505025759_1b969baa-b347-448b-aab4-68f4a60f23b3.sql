
-- 1. bills_to_parent flag
ALTER TABLE public.tenant_relationships
  ADD COLUMN IF NOT EXISTS bills_to_parent boolean NOT NULL DEFAULT false;

-- 2. resolve_billing_tenant_id helper
CREATE OR REPLACE FUNCTION public.resolve_billing_tenant_id(_tenant_id bigint)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT tr.parent_tenant_id
       FROM tenant_relationships tr
      WHERE tr.child_tenant_id = _tenant_id
        AND tr.bills_to_parent = true
      LIMIT 1),
    _tenant_id
  );
$$;

-- 3. Update compute_membership_usage to roll child time into parent and zero-out child
CREATE OR REPLACE FUNCTION public.compute_membership_usage(p_client_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_billing_tenant_id bigint;
  v_parent_name text;
BEGIN
  SELECT id, client_onboarded_at, created_at, status, name
  INTO v_tenant
  FROM tenants
  WHERE id = p_client_id;

  IF v_tenant IS NULL THEN
    RETURN jsonb_build_object('error', 'tenant_not_found');
  END IF;

  -- If this tenant's time bills to a parent, return a redirect payload.
  v_billing_tenant_id := resolve_billing_tenant_id(p_client_id);
  IF v_billing_tenant_id <> p_client_id THEN
    SELECT name INTO v_parent_name FROM tenants WHERE id = v_billing_tenant_id;
    RETURN jsonb_build_object(
      'tier_name', 'Bills to Parent',
      'included_hours_annual', 0,
      'membership_start_date', null,
      'membership_end_date', null,
      'hours_used_in_year', 0,
      'hours_remaining', 0,
      'percent_utilised', null,
      'flags', '["bills_to_parent"]'::jsonb,
      'billing_parent_tenant_id', v_billing_tenant_id,
      'billing_parent_name', v_parent_name
    );
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

  -- Aggregate self + any children that bill to this tenant.
  SELECT ROUND(COALESCE(SUM(te.duration_minutes / 60.0), 0), 2)
  INTO v_hours_used
  FROM time_entries te
  WHERE te.tenant_id IN (
          SELECT p_client_id
          UNION
          SELECT tr.child_tenant_id
            FROM tenant_relationships tr
           WHERE tr.parent_tenant_id = p_client_id
             AND tr.bills_to_parent = true
        )
    AND te.start_at >= v_start
    AND te.start_at < (v_end + interval '1 day');

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
$function$;

-- 4. Backfill: 7541 -> 7544 bills to parent
UPDATE public.tenant_relationships
   SET bills_to_parent = true
 WHERE parent_tenant_id = 7541 AND child_tenant_id = 7544;

-- 5. Tenant name lock helper
CREATE OR REPLACE FUNCTION public.tenant_name_is_locked(_tenant_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(btrim(rto_id) ~ '^[0-9]+$', false)
    FROM tenants
   WHERE id = _tenant_id;
$$;
