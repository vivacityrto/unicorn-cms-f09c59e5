-- Add included_minutes to client_packages for fast package-level hour calculations
ALTER TABLE public.client_packages 
ADD COLUMN IF NOT EXISTS included_minutes integer NOT NULL DEFAULT 0;

-- Create client_alerts table for threshold notifications
CREATE TABLE IF NOT EXISTS public.client_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  package_id bigint NULL REFERENCES public.packages(id) ON DELETE SET NULL,
  client_package_id uuid NULL REFERENCES public.client_packages(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  body text NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  threshold_percent integer NULL,
  is_dismissed boolean NOT NULL DEFAULT false,
  dismissed_by uuid NULL,
  dismissed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for client_alerts
CREATE INDEX IF NOT EXISTS idx_client_alerts_tenant_client ON public.client_alerts(tenant_id, client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_alerts_package ON public.client_alerts(client_package_id) WHERE client_package_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_alerts_not_dismissed ON public.client_alerts(tenant_id, is_dismissed) WHERE is_dismissed = false;

-- Unique constraint to prevent duplicate threshold alerts per package
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_alerts_threshold_unique 
ON public.client_alerts(client_package_id, threshold_percent) 
WHERE alert_type = 'usage_threshold' AND is_dismissed = false;

-- Enable RLS on client_alerts
ALTER TABLE public.client_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for client_alerts (with correct user_uuid column name)
CREATE POLICY "client_alerts_select_tenant" ON public.client_alerts
FOR SELECT USING (
  tenant_id IN (SELECT tenant_id FROM public.connected_tenants WHERE user_uuid = auth.uid())
);

CREATE POLICY "client_alerts_insert_rpc" ON public.client_alerts
FOR INSERT WITH CHECK (
  tenant_id IN (SELECT tenant_id FROM public.connected_tenants WHERE user_uuid = auth.uid())
);

CREATE POLICY "client_alerts_update_dismiss" ON public.client_alerts
FOR UPDATE USING (
  tenant_id IN (SELECT tenant_id FROM public.connected_tenants WHERE user_uuid = auth.uid())
  AND (
    EXISTS (SELECT 1 FROM public.users WHERE user_uuid = auth.uid() AND role IN ('SuperAdmin', 'Admin'))
  )
);

-- Function: Get package usage stats
CREATE OR REPLACE FUNCTION public.rpc_get_package_usage(
  p_client_id bigint,
  p_client_package_id uuid
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

  -- Calculate total used minutes (only entries linked to this package)
  SELECT COALESCE(SUM(te.duration_minutes), 0)
  INTO v_used_minutes
  FROM public.time_entries te
  WHERE te.tenant_id = v_tenant_id
    AND te.client_id = p_client_id
    AND te.package_id = v_package_id;

  -- Calculate trailing 30-day usage
  SELECT COALESCE(SUM(te.duration_minutes), 0)
  INTO v_trailing_30d_minutes
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
    'package_id', v_package_id
  );
END;
$$;

-- Function: Check and create threshold alerts
CREATE OR REPLACE FUNCTION public.rpc_check_package_thresholds(
  p_client_id bigint,
  p_client_package_id uuid
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
  -- Get usage stats
  v_usage := public.rpc_get_package_usage(p_client_id, p_client_package_id);
  
  IF v_usage->>'error' IS NOT NULL THEN
    RETURN v_usage;
  END IF;

  v_used_percent := (v_usage->>'used_percent')::numeric;

  -- Get tenant and package info
  SELECT cp.tenant_id, p.name
  INTO v_tenant_id, v_package_name
  FROM public.client_packages cp
  JOIN public.packages p ON p.id = cp.package_id
  WHERE cp.id = p_client_package_id;

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

  -- Check if alert already exists for this threshold (not dismissed)
  IF NOT EXISTS (
    SELECT 1 FROM public.client_alerts
    WHERE client_package_id = p_client_package_id
      AND threshold_percent = v_threshold
      AND alert_type = 'usage_threshold'
      AND is_dismissed = false
  ) THEN
    -- Create new alert
    INSERT INTO public.client_alerts (
      tenant_id, client_id, package_id, client_package_id,
      alert_type, severity, title, body, threshold_percent, meta
    )
    SELECT 
      v_tenant_id, p_client_id, (v_usage->>'package_id')::bigint, p_client_package_id,
      'usage_threshold', v_severity, v_title, v_body, v_threshold,
      jsonb_build_object(
        'used_percent', v_used_percent,
        'used_minutes', v_usage->>'used_minutes',
        'included_minutes', v_usage->>'included_minutes',
        'remaining_minutes', v_usage->>'remaining_minutes'
      )
    RETURNING id INTO v_alert_id;

    v_created_alerts := jsonb_build_array(
      jsonb_build_object(
        'id', v_alert_id,
        'threshold', v_threshold,
        'severity', v_severity,
        'title', v_title
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'usage', v_usage,
    'alerts_created', v_created_alerts
  );
END;
$$;

-- Function: Dismiss an alert
CREATE OR REPLACE FUNCTION public.rpc_dismiss_alert(
  p_alert_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tenant_id bigint;
BEGIN
  -- Get alert tenant
  SELECT tenant_id INTO v_tenant_id
  FROM public.client_alerts
  WHERE id = p_alert_id;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'alert_not_found');
  END IF;

  -- Check access
  IF NOT EXISTS (
    SELECT 1 FROM public.connected_tenants 
    WHERE user_uuid = auth.uid() AND tenant_id = v_tenant_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;

  -- Dismiss the alert
  UPDATE public.client_alerts
  SET is_dismissed = true,
      dismissed_by = auth.uid(),
      dismissed_at = now()
  WHERE id = p_alert_id;

  RETURN jsonb_build_object('success', true);
END;
$$;