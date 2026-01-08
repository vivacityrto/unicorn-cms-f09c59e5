-- Update rpc_get_package_usage to include breakdown by source
CREATE OR REPLACE FUNCTION public.rpc_get_package_usage(p_client_id bigint, p_client_package_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- Source breakdowns - totals
  v_manual_minutes_total bigint;
  v_timer_minutes_total bigint;
  v_calendar_minutes_total bigint;
  -- Source breakdowns - 30 day
  v_manual_minutes_30d bigint;
  v_timer_minutes_30d bigint;
  v_calendar_minutes_30d bigint;
BEGIN
  -- Get package details
  SELECT cp.tenant_id, cp.package_id, COALESCE(NULLIF(cp.included_minutes, 0), p.total_hours * 60, 0)
  INTO v_tenant_id, v_package_id, v_included_minutes
  FROM public.client_packages cp
  JOIN public.packages p ON p.id = cp.package_id
  WHERE cp.id = p_client_package_id AND cp.tenant_id = p_client_id;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('error', 'package_not_found');
  END IF;

  -- Check tenant access
  IF NOT EXISTS (
    SELECT 1 FROM public.connected_tenants 
    WHERE user_uuid = auth.uid() AND tenant_id = v_tenant_id
  ) THEN
    RETURN jsonb_build_object('error', 'access_denied');
  END IF;

  -- Calculate total used minutes by source
  SELECT 
    COALESCE(SUM(te.duration_minutes), 0),
    COALESCE(SUM(CASE WHEN te.source = 'manual' THEN te.duration_minutes ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN te.source = 'timer' THEN te.duration_minutes ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN te.source = 'calendar' THEN te.duration_minutes ELSE 0 END), 0)
  INTO v_used_minutes, v_manual_minutes_total, v_timer_minutes_total, v_calendar_minutes_total
  FROM public.time_entries te
  WHERE te.tenant_id = v_tenant_id
    AND te.client_id = p_client_id
    AND te.package_id = v_package_id;

  -- Calculate trailing 30-day usage by source
  SELECT 
    COALESCE(SUM(te.duration_minutes), 0),
    COALESCE(SUM(CASE WHEN te.source = 'manual' THEN te.duration_minutes ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN te.source = 'timer' THEN te.duration_minutes ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN te.source = 'calendar' THEN te.duration_minutes ELSE 0 END), 0)
  INTO v_trailing_30d_minutes, v_manual_minutes_30d, v_timer_minutes_30d, v_calendar_minutes_30d
  FROM public.time_entries te
  WHERE te.tenant_id = v_tenant_id
    AND te.client_id = p_client_id
    AND te.package_id = v_package_id
    AND te.created_at >= (now() - interval '30 days');

  -- Calculate percentages and forecasts
  v_remaining_minutes := GREATEST(0, v_included_minutes - v_used_minutes);
  
  IF v_included_minutes > 0 THEN
    v_used_percent := ROUND((v_used_minutes::numeric / v_included_minutes::numeric) * 100, 1);
  ELSE
    v_used_percent := 0;
  END IF;

  -- Calculate daily rate and forecast
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
    -- Source breakdowns - totals
    'manual_minutes_total', v_manual_minutes_total,
    'timer_minutes_total', v_timer_minutes_total,
    'calendar_minutes_total', v_calendar_minutes_total,
    -- Source breakdowns - 30 day
    'manual_minutes_30d', v_manual_minutes_30d,
    'timer_minutes_30d', v_timer_minutes_30d,
    'calendar_minutes_30d', v_calendar_minutes_30d
  );
END;
$function$;