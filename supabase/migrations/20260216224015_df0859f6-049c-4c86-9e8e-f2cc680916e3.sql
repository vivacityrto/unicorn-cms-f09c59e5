
-- ============================================================
-- Phase 12: Client Risk Forecasting Engine (complete)
-- ============================================================

-- 1) tenant_risk_forecasts
CREATE TABLE public.tenant_risk_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  forecast_date date NOT NULL DEFAULT CURRENT_DATE,
  risk_velocity_score numeric NOT NULL DEFAULT 0,
  risk_concentration_score numeric NOT NULL DEFAULT 0,
  stagnation_score numeric NOT NULL DEFAULT 0,
  evidence_instability_score numeric NOT NULL DEFAULT 0,
  regulator_exposure_score numeric NOT NULL DEFAULT 0,
  composite_risk_index numeric NOT NULL DEFAULT 0,
  forecast_risk_status text NOT NULL DEFAULT 'stable'
    CHECK (forecast_risk_status IN ('stable','emerging','elevated','high')),
  key_risk_drivers_json jsonb DEFAULT '[]'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tenant_risk_forecasts_tenant ON public.tenant_risk_forecasts(tenant_id);
CREATE INDEX idx_tenant_risk_forecasts_date ON public.tenant_risk_forecasts(forecast_date);
CREATE INDEX idx_tenant_risk_forecasts_status ON public.tenant_risk_forecasts(forecast_risk_status);

ALTER TABLE public.tenant_risk_forecasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "risk_forecasts_select_staff"
  ON public.tenant_risk_forecasts FOR SELECT TO authenticated
  USING (is_vivacity_team_safe(auth.uid()));

CREATE POLICY "risk_forecasts_select_tenant"
  ON public.tenant_risk_forecasts FOR SELECT TO authenticated
  USING (has_tenant_access_safe(tenant_id, auth.uid()));

CREATE POLICY "risk_forecasts_insert_staff"
  ON public.tenant_risk_forecasts FOR INSERT TO authenticated
  WITH CHECK (is_vivacity_team_safe(auth.uid()));

-- 2) risk_forecast_history
CREATE TABLE public.risk_forecast_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  composite_risk_index numeric NOT NULL DEFAULT 0
);

CREATE INDEX idx_risk_forecast_history_tenant ON public.risk_forecast_history(tenant_id);
CREATE INDEX idx_risk_forecast_history_date ON public.risk_forecast_history(snapshot_date);

ALTER TABLE public.risk_forecast_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "risk_history_select_staff"
  ON public.risk_forecast_history FOR SELECT TO authenticated
  USING (is_vivacity_team_safe(auth.uid()));

CREATE POLICY "risk_history_select_tenant"
  ON public.risk_forecast_history FOR SELECT TO authenticated
  USING (has_tenant_access_safe(tenant_id, auth.uid()));

CREATE POLICY "risk_history_insert_staff"
  ON public.risk_forecast_history FOR INSERT TO authenticated
  WITH CHECK (is_vivacity_team_safe(auth.uid()));

-- 3) Materialized view
CREATE MATERIALIZED VIEW public.v_risk_forecast_trends AS
SELECT
  trf.tenant_id,
  t.name AS tenant_name,
  trf.forecast_date,
  trf.composite_risk_index,
  trf.forecast_risk_status,
  trf.risk_velocity_score,
  trf.risk_concentration_score,
  trf.stagnation_score,
  trf.evidence_instability_score,
  trf.regulator_exposure_score
FROM public.tenant_risk_forecasts trf
JOIN public.tenants t ON t.id = trf.tenant_id
WHERE trf.forecast_date >= (CURRENT_DATE - INTERVAL '90 days')
WITH DATA;

CREATE UNIQUE INDEX idx_v_risk_forecast_trends_uniq
  ON public.v_risk_forecast_trends (tenant_id, forecast_date);

-- 4) Audit trigger
CREATE OR REPLACE FUNCTION public.fn_audit_risk_forecast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_events (action, entity, entity_id, user_id, details)
  VALUES (
    'risk_forecast_generated',
    'tenant_risk_forecasts',
    NEW.id::text,
    auth.uid(),
    jsonb_build_object(
      'tenant_id', NEW.tenant_id,
      'composite_risk_index', NEW.composite_risk_index,
      'forecast_risk_status', NEW.forecast_risk_status
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_risk_forecast
  AFTER INSERT ON public.tenant_risk_forecasts
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_risk_forecast();
