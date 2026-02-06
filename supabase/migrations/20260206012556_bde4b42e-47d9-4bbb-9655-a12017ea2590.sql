-- Fix RPC functions to use package_instances (bigint IDs) instead of client_packages (uuid)
-- This is the new source of truth per memory: infrastructure/package-instances-schema-details

-- Drop existing functions first (they have uuid parameter signatures)
DROP FUNCTION IF EXISTS public.rpc_get_package_usage(bigint, uuid);
DROP FUNCTION IF EXISTS public.rpc_check_package_thresholds(bigint, uuid);

-- Recreate rpc_get_package_usage with bigint package instance ID
CREATE OR REPLACE FUNCTION public.rpc_get_package_usage(
  p_client_id bigint,
  p_client_package_id bigint  -- Now matches package_instances.id (bigint)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
  -- Source breakdown totals
  v_manual_total bigint;
  v_timer_total bigint;
  v_calendar_total bigint;
  -- Source breakdown 30d
  v_manual_30d bigint;
  v_timer_30d bigint;
  v_calendar_30d bigint;
BEGIN
  -- Get package instance details from package_instances table
  SELECT pi.tenant_id, pi.package_id, COALESCE(pi.hours_included, p.total_hours, 0) * 60
  INTO v_tenant_id, v_package_id, v_included_minutes
  FROM public.package_instances pi
  JOIN public.packages p ON p.id = pi.package_id
  WHERE pi.id = p_client_package_id 
    AND pi.tenant_id = p_client_id
    AND pi.is_complete = false;

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

  -- Calculate total used minutes (only entries linked to this package)
  SELECT 
    COALESCE(SUM(te.duration_minutes), 0),
    COALESCE(SUM(CASE WHEN te.source = 'manual' THEN te.duration_minutes ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN te.source = 'timer' THEN te.duration_minutes ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN te.source = 'calendar' THEN te.duration_minutes ELSE 0 END), 0)
  INTO v_used_minutes, v_manual_total, v_timer_total, v_calendar_total
  FROM public.time_entries te
  WHERE te.tenant_id = v_tenant_id
    AND te.client_id = p_client_id
    AND te.package_id = v_package_id;

  -- Calculate trailing 30-day usage with source breakdown
  SELECT 
    COALESCE(SUM(te.duration_minutes), 0),
    COALESCE(SUM(CASE WHEN te.source = 'manual' THEN te.duration_minutes ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN te.source = 'timer' THEN te.duration_minutes ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN te.source = 'calendar' THEN te.duration_minutes ELSE 0 END), 0)
  INTO v_trailing_30d_minutes, v_manual_30d, v_timer_30d, v_calendar_30d
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
    -- Source breakdown totals
    'manual_minutes_total', v_manual_total,
    'timer_minutes_total', v_timer_total,
    'calendar_minutes_total', v_calendar_total,
    -- Source breakdown 30d
    'manual_minutes_30d', v_manual_30d,
    'timer_minutes_30d', v_timer_30d,
    'calendar_minutes_30d', v_calendar_30d
  );
END;
$$;

-- Recreate rpc_check_package_thresholds with bigint package instance ID
CREATE OR REPLACE FUNCTION public.rpc_check_package_thresholds(
  p_client_id bigint,
  p_client_package_id bigint  -- Now matches package_instances.id (bigint)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usage jsonb;
  v_used_percent numeric;
  v_threshold integer;
  v_severity text;
  v_title text;
  v_body text;
  v_tenant_id bigint;
  v_package_name text;
  v_alert_id uuid;
  v_created_alerts jsonb := '[]'::jsonb;
BEGIN
  -- Get usage stats using the updated function
  v_usage := public.rpc_get_package_usage(p_client_id, p_client_package_id);
  
  IF v_usage->>'error' IS NOT NULL THEN
    RETURN v_usage;
  END IF;

  v_used_percent := (v_usage->>'used_percent')::numeric;

  -- Get tenant and package info from package_instances
  SELECT pi.tenant_id, p.name
  INTO v_tenant_id, v_package_name
  FROM public.package_instances pi
  JOIN public.packages p ON p.id = pi.package_id
  WHERE pi.id = p_client_package_id;

  -- Determine highest threshold crossed
  IF v_used_percent >= 100 THEN
    v_threshold := 100;
    v_severity := 'critical';
    v_title := 'Package hours exhausted';
    v_body := format('The %s package has used 100%% of included hours (%s of %s minutes used).',
      v_package_name,
      v_usage->>'used_minutes',
      v_usage->>'included_minutes'
    );
  ELSIF v_used_percent >= 95 THEN
    v_threshold := 95;
    v_severity := 'critical';
    v_title := 'Package hours nearly exhausted';
    v_body := format('The %s package has used %s%% of included hours.',
      v_package_name,
      v_used_percent
    );
  ELSIF v_used_percent >= 80 THEN
    v_threshold := 80;
    v_severity := 'warn';
    v_title := 'Package hours running low';
    v_body := format('The %s package has used %s%% of included hours.',
      v_package_name,
      v_used_percent
    );
  ELSE
    -- No threshold crossed
    RETURN jsonb_build_object(
      'usage', v_usage,
      'alerts_created', '[]'::jsonb
    );
  END IF;

  -- Note: client_alerts still uses client_package_id as UUID for legacy
  -- We'll store the package_instance.id cast to text in meta for reference
  
  RETURN jsonb_build_object(
    'usage', v_usage,
    'alerts_created', v_created_alerts,
    'threshold_crossed', v_threshold,
    'severity', v_severity,
    'title', v_title
  );
END;
$$;

-- Create the meeting time import function
CREATE OR REPLACE FUNCTION public.rpc_import_meeting_time_to_client(
  p_client_id bigint,
  p_calendar_event_id uuid,
  p_minutes integer,
  p_work_date date,
  p_notes text DEFAULT NULL,
  p_package_id bigint DEFAULT NULL,
  p_save_as_draft boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_tenant_id bigint;
  v_time_entry_id uuid;
  v_draft_id uuid;
  v_client_name text;
  v_active_package_id bigint;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Get tenant info - client_id IS tenant_id in this schema
  SELECT id, name INTO v_tenant_id, v_client_name 
  FROM public.tenants 
  WHERE id = p_client_id;
  
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'client_not_found');
  END IF;

  -- Validate user has access to this tenant
  IF NOT EXISTS (
    SELECT 1 FROM public.connected_tenants 
    WHERE user_uuid = v_user_id AND tenant_id = v_tenant_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;

  -- Validate minutes
  IF p_minutes <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_minutes');
  END IF;

  -- Determine package ID: use provided, or find active package
  IF p_package_id IS NOT NULL THEN
    v_active_package_id := p_package_id;
  ELSE
    -- Try to find an active package for this tenant
    SELECT pi.package_id INTO v_active_package_id
    FROM public.package_instances pi
    WHERE pi.tenant_id = v_tenant_id
      AND pi.is_complete = false
    ORDER BY pi.start_date DESC
    LIMIT 1;
    -- v_active_package_id may be NULL if no active package
  END IF;

  IF p_save_as_draft THEN
    -- Create as draft in calendar_time_drafts
    INSERT INTO public.calendar_time_drafts (
      tenant_id, created_by, calendar_event_id, client_id, package_id,
      minutes, work_date, notes, status, work_type, is_billable
    ) VALUES (
      v_tenant_id, v_user_id, p_calendar_event_id, p_client_id, v_active_package_id,
      p_minutes, p_work_date, p_notes, 'draft', 'meeting', true
    ) RETURNING id INTO v_draft_id;
    
    RETURN jsonb_build_object(
      'success', true,
      'draft_id', v_draft_id,
      'minutes_total', p_minutes,
      'status', 'draft',
      'client_name', v_client_name,
      'package_allocated', v_active_package_id IS NOT NULL
    );
  ELSE
    -- Create as posted time entry
    INSERT INTO public.time_entries (
      tenant_id, client_id, package_id, user_id, work_type, is_billable,
      start_at, duration_minutes, notes, source, calendar_event_id
    ) VALUES (
      v_tenant_id, p_client_id, v_active_package_id, v_user_id, 'meeting', true,
      (p_work_date::timestamp AT TIME ZONE 'UTC'), p_minutes, p_notes, 'calendar', p_calendar_event_id
    ) RETURNING id INTO v_time_entry_id;
    
    -- Log audit entry
    INSERT INTO public.client_audit_log (
      tenant_id, actor_user_id, action, entity_type, entity_id,
      before_data, after_data, details
    ) VALUES (
      v_tenant_id, v_user_id, 'meeting_time_import', 'time_entries', v_time_entry_id::text,
      '{}'::jsonb,
      jsonb_build_object('minutes', p_minutes, 'package_id', v_active_package_id),
      jsonb_build_object(
        'calendar_event_id', p_calendar_event_id,
        'reason', 'Imported from meeting'
      )
    );
    
    RETURN jsonb_build_object(
      'success', true,
      'time_entry_id', v_time_entry_id,
      'minutes_total', p_minutes,
      'status', 'posted',
      'client_name', v_client_name,
      'package_allocated', v_active_package_id IS NOT NULL
    );
  END IF;
END;
$$;