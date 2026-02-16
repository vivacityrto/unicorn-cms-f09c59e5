
-- Phase 13: Strategic Intelligence Command Centre (complete)

-- 1) Strategic Signal Summary table
CREATE TABLE public.strategic_signal_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_type text NOT NULL,
  signal_severity text NOT NULL DEFAULT 'info',
  signal_summary text NOT NULL,
  affected_entities_json jsonb DEFAULT '[]'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.strategic_signal_summary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "strategic_signal_summary_select_vivacity"
  ON public.strategic_signal_summary FOR SELECT
  USING (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "strategic_signal_summary_insert_system"
  ON public.strategic_signal_summary FOR INSERT
  WITH CHECK (true);

CREATE INDEX idx_strategic_signal_type ON public.strategic_signal_summary(signal_type);
CREATE INDEX idx_strategic_signal_generated ON public.strategic_signal_summary(generated_at DESC);

-- 2) Materialized view: v_strategic_portfolio_risk
CREATE MATERIALIZED VIEW public.v_strategic_portfolio_risk AS
SELECT
  forecast_risk_status,
  COUNT(*) AS tenant_count,
  ROUND(AVG(composite_risk_index), 1) AS avg_index,
  COUNT(*) FILTER (WHERE composite_risk_index > 50) AS elevated_plus_count
FROM public.tenant_risk_forecasts trf
WHERE trf.forecast_date = (SELECT MAX(forecast_date) FROM public.tenant_risk_forecasts)
GROUP BY forecast_risk_status
WITH NO DATA;

CREATE UNIQUE INDEX idx_v_strategic_portfolio_risk ON public.v_strategic_portfolio_risk(forecast_risk_status);

-- 3) Materialized view: v_strategic_capacity_pressure
CREATE MATERIALIZED VIEW public.v_strategic_capacity_pressure AS
SELECT
  ws.user_id,
  CONCAT(u.first_name, ' ', u.last_name) AS consultant_name,
  ws.capacity_utilisation_percentage,
  ws.overload_risk_status,
  ws.high_risk_stages_count,
  ws.overdue_tasks_count
FROM public.workload_snapshots ws
JOIN public.users u ON u.user_uuid = ws.user_id
WHERE ws.snapshot_date = (SELECT MAX(snapshot_date) FROM public.workload_snapshots)
WITH NO DATA;

CREATE UNIQUE INDEX idx_v_strategic_capacity ON public.v_strategic_capacity_pressure(user_id);

-- 4) Audit trigger for strategic signals
CREATE OR REPLACE FUNCTION public.fn_audit_strategic_signal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_events (action, entity, entity_id, user_id, details)
  VALUES (
    'strategic_signal_generated',
    'strategic_signal_summary',
    NEW.id::text,
    NULL,
    jsonb_build_object('signal_type', NEW.signal_type, 'severity', NEW.signal_severity)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_strategic_signal
  AFTER INSERT ON public.strategic_signal_summary
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_audit_strategic_signal();
