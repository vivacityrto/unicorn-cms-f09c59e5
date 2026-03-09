
-- Add parent_instance_id column to package_instances for add-on linking
ALTER TABLE public.package_instances
  ADD COLUMN IF NOT EXISTS parent_instance_id bigint
  REFERENCES public.package_instances(id);

-- Index for efficient child lookups
CREATE INDEX IF NOT EXISTS idx_package_instances_parent_instance_id
  ON public.package_instances(parent_instance_id)
  WHERE parent_instance_id IS NOT NULL;

-- Update rpc_get_package_usage to include time entries from child instances
CREATE OR REPLACE FUNCTION public.rpc_get_package_usage(p_client_id bigint, p_client_package_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id bigint;
  v_package_id bigint;
  v_included_minutes integer;
  v_used_minutes bigint;
  v_trailing_30d_minutes bigint;
  v_used_percent numeric;
  v_remaining_minutes bigint;
  v_forecast_days numeric;
  v_daily_rate numeric;
  v_manual_total bigint;
  v_timer_total bigint;
  v_calendar_total bigint;
  v_manual_30d bigint;
  v_timer_30d bigint;
  v_calendar_30d bigint;
  v_billable_total bigint;
  v_non_billable_total bigint;
  v_renewal_start timestamptz;
  v_renewal_end timestamptz;
BEGIN
  -- Get package instance details
  SELECT pi.tenant_id, pi.package_id,
    COALESCE(pi.included_minutes, COALESCE(pi.hours_included, p.total_hours, 0) * 60),
    COALESCE(pi.next_renewal_date, pi.start_date::date + interval '1 year'),
    (COALESCE(pi.next_renewal_date, pi.start_date::date + interval '1 year') - interval '1 year')
  INTO v_tenant_id, v_package_id, v_included_minutes, v_renewal_end, v_renewal_start
  FROM public.package_instances pi
  JOIN public.packages p ON p.id = pi.package_id
  WHERE pi.id = p_client_package_id 
    AND pi.tenant_id = p_client_id
    AND pi.is_complete = false;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('error', 'package_not_found');
  END IF;

  -- Check tenant access: allow Vivacity staff OR connected tenant members
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.connected_tenants 
      WHERE user_uuid = auth.uid() AND tenant_id = v_tenant_id
    ) THEN
      RETURN jsonb_build_object('error', 'access_denied');
    END IF;
  END IF;

  -- Calculate total used minutes scoped to renewal year
  -- Include time entries from this instance AND any child instances
  SELECT 
    COALESCE(SUM(te.duration_minutes), 0),
    COALESCE(SUM(CASE WHEN te.source = 'manual' THEN te.duration_minutes ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN te.source = 'timer' THEN te.duration_minutes ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN te.source = 'calendar' THEN te.duration_minutes ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN te.is_billable = true THEN te.duration_minutes ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN te.is_billable = false THEN te.duration_minutes ELSE 0 END), 0)
  INTO v_used_minutes, v_manual_total, v_timer_total, v_calendar_total, v_billable_total, v_non_billable_total
  FROM public.time_entries te
  WHERE te.tenant_id = v_tenant_id
    AND (
      te.package_id = p_client_package_id
      OR te.package_id IN (SELECT id FROM public.package_instances WHERE parent_instance_id = p_client_package_id)
    )
    AND te.start_at >= v_renewal_start
    AND te.start_at < v_renewal_end;

  -- Calculate trailing 30-day usage (also including child instances)
  SELECT 
    COALESCE(SUM(te.duration_minutes), 0),
    COALESCE(SUM(CASE WHEN te.source = 'manual' THEN te.duration_minutes ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN te.source = 'timer' THEN te.duration_minutes ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN te.source = 'calendar' THEN te.duration_minutes ELSE 0 END), 0)
  INTO v_trailing_30d_minutes, v_manual_30d, v_timer_30d, v_calendar_30d
  FROM public.time_entries te
  WHERE te.tenant_id = v_tenant_id
    AND (
      te.package_id = p_client_package_id
      OR te.package_id IN (SELECT id FROM public.package_instances WHERE parent_instance_id = p_client_package_id)
    )
    AND te.start_at >= (now() - interval '30 days')
    AND te.start_at >= v_renewal_start
    AND te.start_at < v_renewal_end;

  -- Add hours_added bonus
  v_included_minutes := v_included_minutes + COALESCE((
    SELECT COALESCE(hours_added, 0) * 60 FROM public.package_instances WHERE id = p_client_package_id
  ), 0);

  -- Calculate percentages and forecasts
  v_remaining_minutes := v_included_minutes - v_used_minutes;
  
  IF v_included_minutes > 0 THEN
    v_used_percent := ROUND((v_used_minutes::numeric / v_included_minutes::numeric) * 100, 1);
  ELSE
    v_used_percent := 0;
  END IF;

  v_daily_rate := v_trailing_30d_minutes::numeric / 30.0;
  
  IF v_daily_rate > 0 AND v_remaining_minutes > 0 THEN
    v_forecast_days := ROUND(v_remaining_minutes::numeric / v_daily_rate, 0);
  ELSE
    v_forecast_days := NULL;
  END IF;

  RETURN jsonb_build_object(
    'included_minutes', v_included_minutes,
    'used_minutes', v_used_minutes,
    'remaining_minutes', v_remaining_minutes,
    'used_percent', v_used_percent,
    'trailing_30d_minutes', v_trailing_30d_minutes,
    'daily_rate_minutes', ROUND(v_daily_rate, 1),
    'forecast_days_to_zero', v_forecast_days,
    'package_id', v_package_id,
    'manual_minutes_total', v_manual_total,
    'timer_minutes_total', v_timer_total,
    'calendar_minutes_total', v_calendar_total,
    'manual_minutes_30d', v_manual_30d,
    'timer_minutes_30d', v_timer_30d,
    'calendar_minutes_30d', v_calendar_30d,
    'billable_minutes_total', v_billable_total,
    'non_billable_minutes_total', v_non_billable_total
  );
END;
$$;
