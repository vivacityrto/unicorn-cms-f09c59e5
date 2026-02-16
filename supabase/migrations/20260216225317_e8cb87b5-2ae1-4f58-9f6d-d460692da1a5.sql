
-- Phase 15: Commercial & Retention Risk Intelligence

-- 1) tenant_commercial_profiles
CREATE TABLE public.tenant_commercial_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  package_type text,
  contract_start_date date,
  contract_end_date date,
  renewal_window_start date,
  renewal_window_end date,
  average_monthly_revenue numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tcp_tenant ON public.tenant_commercial_profiles(tenant_id);

ALTER TABLE public.tenant_commercial_profiles ENABLE ROW LEVEL SECURITY;

-- Only Vivacity internal staff can manage commercial profiles
CREATE POLICY "vivacity_staff_select_commercial_profiles"
  ON public.tenant_commercial_profiles FOR SELECT
  USING (public.is_vivacity_internal_safe(auth.uid()));

CREATE POLICY "vivacity_staff_insert_commercial_profiles"
  ON public.tenant_commercial_profiles FOR INSERT
  WITH CHECK (public.is_vivacity_internal_safe(auth.uid()));

CREATE POLICY "vivacity_staff_update_commercial_profiles"
  ON public.tenant_commercial_profiles FOR UPDATE
  USING (public.is_vivacity_internal_safe(auth.uid()));

CREATE POLICY "vivacity_staff_delete_commercial_profiles"
  ON public.tenant_commercial_profiles FOR DELETE
  USING (public.is_super_admin_safe(auth.uid()));

-- 2) tenant_retention_forecasts
CREATE TABLE public.tenant_retention_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  forecast_date date NOT NULL DEFAULT CURRENT_DATE,
  engagement_score numeric DEFAULT 0,
  value_utilisation_score numeric DEFAULT 0,
  service_pressure_score numeric DEFAULT 0,
  risk_stress_overlap_score numeric DEFAULT 0,
  composite_retention_risk_index numeric DEFAULT 0,
  retention_status text NOT NULL DEFAULT 'stable'
    CHECK (retention_status IN ('stable','watch','vulnerable','high_risk')),
  key_drivers_json jsonb DEFAULT '[]'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_trf_tenant ON public.tenant_retention_forecasts(tenant_id);
CREATE INDEX idx_trf_date ON public.tenant_retention_forecasts(forecast_date DESC);

ALTER TABLE public.tenant_retention_forecasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vivacity_staff_select_retention_forecasts"
  ON public.tenant_retention_forecasts FOR SELECT
  USING (public.is_vivacity_internal_safe(auth.uid()));

CREATE POLICY "service_role_insert_retention_forecasts"
  ON public.tenant_retention_forecasts FOR INSERT
  WITH CHECK (true);

-- 3) retention_forecast_history
CREATE TABLE public.retention_forecast_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  composite_retention_risk_index numeric DEFAULT 0
);

CREATE INDEX idx_rfh_tenant ON public.retention_forecast_history(tenant_id);
CREATE INDEX idx_rfh_date ON public.retention_forecast_history(snapshot_date DESC);

ALTER TABLE public.retention_forecast_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vivacity_staff_select_retention_history"
  ON public.retention_forecast_history FOR SELECT
  USING (public.is_vivacity_internal_safe(auth.uid()));

CREATE POLICY "service_role_insert_retention_history"
  ON public.retention_forecast_history FOR INSERT
  WITH CHECK (true);

-- 4) Materialized view: v_retention_risk_trends
CREATE MATERIALIZED VIEW public.v_retention_risk_trends AS
SELECT
  trf.tenant_id,
  t.name AS tenant_name,
  trf.forecast_date,
  trf.composite_retention_risk_index,
  trf.retention_status,
  trf.engagement_score,
  trf.value_utilisation_score,
  trf.service_pressure_score,
  trf.risk_stress_overlap_score,
  tcp.contract_end_date,
  tcp.renewal_window_start,
  tcp.renewal_window_end,
  tcp.average_monthly_revenue,
  CASE
    WHEN tcp.contract_end_date IS NOT NULL
      AND tcp.contract_end_date <= CURRENT_DATE + INTERVAL '90 days'
    THEN true ELSE false
  END AS within_renewal_window
FROM public.tenant_retention_forecasts trf
JOIN public.tenants t ON t.id = trf.tenant_id
LEFT JOIN public.tenant_commercial_profiles tcp ON tcp.tenant_id = trf.tenant_id
WHERE trf.forecast_date >= CURRENT_DATE - INTERVAL '90 days'
ORDER BY trf.forecast_date DESC;

CREATE UNIQUE INDEX idx_vrt_tenant_date ON public.v_retention_risk_trends(tenant_id, forecast_date);

-- 5) Audit trigger for retention forecasts
CREATE OR REPLACE FUNCTION public.fn_audit_retention_forecast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_events (action, entity, entity_id, user_id, details)
  VALUES (
    'retention_forecast_generated',
    'tenant_retention_forecasts',
    NEW.id::text,
    NULL,
    jsonb_build_object(
      'tenant_id', NEW.tenant_id,
      'composite_index', NEW.composite_retention_risk_index,
      'retention_status', NEW.retention_status,
      'forecast_date', NEW.forecast_date
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_retention_forecast
  AFTER INSERT ON public.tenant_retention_forecasts
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_audit_retention_forecast();

-- 6) Updated_at trigger for commercial profiles
CREATE TRIGGER update_tenant_commercial_profiles_updated_at
  BEFORE UPDATE ON public.tenant_commercial_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
