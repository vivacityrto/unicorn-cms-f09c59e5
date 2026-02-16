
-- Phase 18: Real-Time Risk Command Engine

-- 1) real_time_risk_alerts
CREATE TABLE public.real_time_risk_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  source_entity_id uuid,
  source_type text,
  alert_type text NOT NULL CHECK (alert_type IN (
    'high_severity_risk','critical_stage','regulator_overlap',
    'repeated_gap','rapid_risk_spike','consultant_overload_risk'
  )),
  severity text NOT NULL DEFAULT 'moderate' CHECK (severity IN ('moderate','high','critical')),
  alert_summary text NOT NULL,
  recommended_actions_json jsonb DEFAULT '[]'::jsonb,
  acknowledged_flag boolean NOT NULL DEFAULT false,
  acknowledged_by_user_id uuid,
  acknowledged_at timestamptz,
  resolved_flag boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  archived_flag boolean NOT NULL DEFAULT false,
  dedupe_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rt_risk_alerts_tenant ON public.real_time_risk_alerts(tenant_id);
CREATE INDEX idx_rt_risk_alerts_type ON public.real_time_risk_alerts(alert_type);
CREATE INDEX idx_rt_risk_alerts_severity ON public.real_time_risk_alerts(severity);
CREATE INDEX idx_rt_risk_alerts_created ON public.real_time_risk_alerts(created_at DESC);
CREATE INDEX idx_rt_risk_alerts_dedupe ON public.real_time_risk_alerts(dedupe_hash);

-- Enable RLS
ALTER TABLE public.real_time_risk_alerts ENABLE ROW LEVEL SECURITY;

-- Vivacity internal staff can see all
CREATE POLICY "rt_risk_alerts_vivacity_select"
  ON public.real_time_risk_alerts FOR SELECT
  USING (public.is_vivacity_internal_safe(auth.uid()));

CREATE POLICY "rt_risk_alerts_vivacity_update"
  ON public.real_time_risk_alerts FOR UPDATE
  USING (public.is_vivacity_internal_safe(auth.uid()));

-- Service role insert (edge functions)
CREATE POLICY "rt_risk_alerts_service_insert"
  ON public.real_time_risk_alerts FOR INSERT
  WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.real_time_risk_alerts;

-- 2) Audit logging function
CREATE OR REPLACE FUNCTION public.fn_audit_risk_command(
  p_actor_user_id uuid,
  p_tenant_id bigint,
  p_alert_id uuid,
  p_action text,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_events (action, entity, entity_id, user_id, details)
  VALUES (
    p_action,
    'real_time_risk_alert',
    COALESCE(p_alert_id::text, 'system'),
    p_actor_user_id,
    jsonb_build_object(
      'tenant_id', p_tenant_id,
      'alert_id', p_alert_id,
      'metadata', p_metadata
    )
  );
END;
$$;
