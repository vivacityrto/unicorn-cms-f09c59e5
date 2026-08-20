-- Phase B of the renewal-period work: lets the Overview tab's "Package
-- Burn-down" widget (ClientTimeSummaryCard.tsx -> usePackageUsageQuery.tsx
-- -> this RPC) show a specific historical renewal period instead of always
-- the current one.
--
-- Adds an optional p_renewal_period_id param. Arity is changing (2 args ->
-- 3), so DROP FUNCTION first - CREATE OR REPLACE matches by exact argument
-- signature and would otherwise silently leave both the old 2-arg and new
-- 3-arg function coexisting as separate overloads (see AGENTS.md's
-- documented 2026-08-14 incident with the same class of mistake).
--
-- When p_renewal_period_id is provided: read that period's own
-- period_start/period_end/included_minutes/carried_in_minutes directly
-- (each package_renewal_periods row is a frozen snapshot of what was true
-- at that renewal - see RenewalConfirmDialog.tsx) instead of deriving the
-- window from package_instances' *current* start_renewal_date/
-- next_renewal_date. Known limitation carried over from the period table's
-- schema: a period row's included_minutes does not capture any
-- hours_added top-up applied after that period closed, only the package's
-- base included_minutes at renewal time plus that period's own carry-in -
-- same caveat as period_number not being a true lifetime count (see the
-- Phase 1 audit entry). Default behaviour (p_renewal_period_id omitted)
-- is byte-for-byte unchanged.
DROP FUNCTION IF EXISTS public.rpc_get_package_usage(bigint, bigint);

CREATE FUNCTION public.rpc_get_package_usage(
  p_client_id bigint,
  p_client_package_id bigint,
  p_renewal_period_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tenant_id bigint;
  v_package_id bigint;
  v_included_minutes integer;
  v_carried_in_minutes integer;
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
  v_period_included_minutes integer;
  v_period_carried_in_minutes integer;
  v_period_start date;
  v_period_end date;
BEGIN
  SELECT pi.tenant_id, pi.package_id,
    COALESCE(pi.included_minutes, COALESCE(pi.hours_included, p.total_hours, 0) * 60),
    COALESCE(pi.next_renewal_date::timestamptz, pi.start_date::timestamptz + interval '1 year'),
    COALESCE(pi.start_renewal_date::timestamptz, pi.start_date::timestamptz)
  INTO v_tenant_id, v_package_id, v_included_minutes, v_renewal_end, v_renewal_start
  FROM public.package_instances pi
  JOIN public.packages p ON p.id = pi.package_id
  WHERE pi.id = p_client_package_id
    AND pi.tenant_id = p_client_id
    AND pi.is_complete = false;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('error', 'package_not_found');
  END IF;

  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.connected_tenants
      WHERE user_uuid = auth.uid() AND tenant_id = v_tenant_id
    ) THEN
      RETURN jsonb_build_object('error', 'access_denied');
    END IF;
  END IF;

  -- A specific period was requested: use its own frozen window/allowance
  -- instead of the package's current renewal window.
  IF p_renewal_period_id IS NOT NULL THEN
    SELECT period_start, period_end, included_minutes, carried_in_minutes
    INTO v_period_start, v_period_end, v_period_included_minutes, v_period_carried_in_minutes
    FROM public.package_renewal_periods
    WHERE id = p_renewal_period_id
      AND package_instance_id = p_client_package_id;

    IF v_period_start IS NULL THEN
      RETURN jsonb_build_object('error', 'period_not_found');
    END IF;

    v_renewal_start := v_period_start::timestamptz;
    v_renewal_end := v_period_end::timestamptz;
    v_included_minutes := v_period_included_minutes;
    v_carried_in_minutes := v_period_carried_in_minutes;
  END IF;

  SELECT
    COALESCE(SUM(te.duration_minutes), 0),
    COALESCE(SUM(CASE WHEN te.source = 'manual'   THEN te.duration_minutes ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN te.source = 'timer'    THEN te.duration_minutes ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN te.source = 'calendar' THEN te.duration_minutes ELSE 0 END), 0)
  INTO v_used_minutes, v_manual_total, v_timer_total, v_calendar_total
  FROM public.time_entries te
  WHERE te.tenant_id = v_tenant_id
    AND (
      te.package_instance_id = p_client_package_id
      OR te.package_instance_id IN (SELECT id FROM public.package_instances WHERE parent_instance_id = p_client_package_id)
    )
    AND te.work_type <> 'carry_over'
    AND te.start_at >= v_renewal_start
    AND te.start_at <  v_renewal_end
    AND te.is_billable = true;

  SELECT
    COALESCE(SUM(CASE WHEN te.is_billable = true  THEN te.duration_minutes ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN te.is_billable = false THEN te.duration_minutes ELSE 0 END), 0)
  INTO v_billable_total, v_non_billable_total
  FROM public.time_entries te
  WHERE te.tenant_id = v_tenant_id
    AND (
      te.package_instance_id = p_client_package_id
      OR te.package_instance_id IN (SELECT id FROM public.package_instances WHERE parent_instance_id = p_client_package_id)
    )
    AND te.start_at >= v_renewal_start
    AND te.start_at <  v_renewal_end;

  SELECT
    COALESCE(SUM(te.duration_minutes), 0),
    COALESCE(SUM(CASE WHEN te.source = 'manual'   THEN te.duration_minutes ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN te.source = 'timer'    THEN te.duration_minutes ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN te.source = 'calendar' THEN te.duration_minutes ELSE 0 END), 0)
  INTO v_trailing_30d_minutes, v_manual_30d, v_timer_30d, v_calendar_30d
  FROM public.time_entries te
  WHERE te.tenant_id = v_tenant_id
    AND (
      te.package_instance_id = p_client_package_id
      OR te.package_instance_id IN (SELECT id FROM public.package_instances WHERE parent_instance_id = p_client_package_id)
    )
    AND te.work_type <> 'carry_over'
    AND te.start_at >= (now() - interval '30 days')
    AND te.start_at >= v_renewal_start
    AND te.start_at <  v_renewal_end
    AND te.is_billable = true;

  IF p_renewal_period_id IS NULL THEN
    -- Default (current-period) behaviour, unchanged from before this migration.
    v_included_minutes := v_included_minutes + COALESCE((
      SELECT COALESCE(hours_added, 0) * 60 FROM public.package_instances WHERE id = p_client_package_id
    ), 0);

    SELECT carried_in_minutes INTO v_carried_in_minutes
    FROM public.package_renewal_periods
    WHERE package_instance_id = p_client_package_id AND closed_at IS NULL;

    v_included_minutes := v_included_minutes + COALESCE(v_carried_in_minutes, 0);
  ELSE
    v_included_minutes := v_included_minutes + COALESCE(v_carried_in_minutes, 0);
  END IF;

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
    'non_billable_minutes_total', v_non_billable_total,
    'carried_in_minutes', COALESCE(v_carried_in_minutes, 0)
  );
END;
$function$;

-- rpc_get_package_usage() is called directly from the frontend via
-- supabase.rpc() (usePackageUsageQuery.tsx) - re-grant EXECUTE to
-- authenticated (DROP FUNCTION clears all grants on the old object; the
-- replacement is a distinct object from Postgres' perspective).
GRANT EXECUTE ON FUNCTION public.rpc_get_package_usage(bigint, bigint, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_package_usage(bigint, bigint, uuid) TO service_role;
