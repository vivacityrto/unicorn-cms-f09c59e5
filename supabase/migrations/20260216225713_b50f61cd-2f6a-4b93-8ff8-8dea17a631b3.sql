
-- Phase 16: Autonomous Workflow Optimisation Layer

-- 1) workflow_optimisation_signals
CREATE TABLE public.workflow_optimisation_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint REFERENCES public.tenants(id) ON DELETE CASCADE,
  stage_instance_id bigint,
  consultant_user_id uuid,
  signal_type text NOT NULL CHECK (signal_type IN (
    'bottleneck_detected','sequencing_issue','workload_imbalance',
    'repeated_rework','stalled_stage','inefficient_task_distribution'
  )),
  signal_severity text NOT NULL DEFAULT 'low' CHECK (signal_severity IN ('low','moderate','high')),
  signal_summary text NOT NULL,
  suggested_action_json jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_flag boolean NOT NULL DEFAULT false,
  resolved_at timestamptz
);

CREATE INDEX idx_wos_tenant ON public.workflow_optimisation_signals(tenant_id);
CREATE INDEX idx_wos_consultant ON public.workflow_optimisation_signals(consultant_user_id);
CREATE INDEX idx_wos_type ON public.workflow_optimisation_signals(signal_type);
CREATE INDEX idx_wos_resolved ON public.workflow_optimisation_signals(resolved_flag);

ALTER TABLE public.workflow_optimisation_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vivacity_staff_select_wos"
  ON public.workflow_optimisation_signals FOR SELECT
  USING (public.is_vivacity_internal_safe(auth.uid()));

CREATE POLICY "service_role_insert_wos"
  ON public.workflow_optimisation_signals FOR INSERT
  WITH CHECK (true);

CREATE POLICY "vivacity_staff_update_wos"
  ON public.workflow_optimisation_signals FOR UPDATE
  USING (public.is_vivacity_internal_safe(auth.uid()));

-- 2) workflow_performance_metrics
CREATE TABLE public.workflow_performance_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_type text NOT NULL,
  average_completion_days numeric DEFAULT 0,
  average_tasks_per_stage numeric DEFAULT 0,
  average_rework_rate numeric DEFAULT 0,
  average_consult_hours numeric DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_wpm_stage_type ON public.workflow_performance_metrics(stage_type);

ALTER TABLE public.workflow_performance_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vivacity_staff_select_wpm"
  ON public.workflow_performance_metrics FOR SELECT
  USING (public.is_vivacity_internal_safe(auth.uid()));

CREATE POLICY "service_role_upsert_wpm"
  ON public.workflow_performance_metrics FOR INSERT
  WITH CHECK (true);

CREATE POLICY "service_role_update_wpm"
  ON public.workflow_performance_metrics FOR UPDATE
  USING (true);

-- 3) Materialized view: v_workflow_efficiency_trends
CREATE MATERIALIZED VIEW public.v_workflow_efficiency_trends AS
SELECT
  wos.signal_type,
  wos.signal_severity,
  COUNT(*) AS signal_count,
  COUNT(*) FILTER (WHERE NOT wos.resolved_flag) AS unresolved_count,
  COUNT(*) FILTER (WHERE wos.created_at >= CURRENT_DATE - INTERVAL '14 days' AND NOT wos.resolved_flag) AS unresolved_14d,
  DATE_TRUNC('day', wos.created_at)::date AS signal_date
FROM public.workflow_optimisation_signals wos
WHERE wos.created_at >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY wos.signal_type, wos.signal_severity, DATE_TRUNC('day', wos.created_at)::date
ORDER BY signal_date DESC;

CREATE INDEX idx_vwet_date ON public.v_workflow_efficiency_trends(signal_date);

-- 4) Audit trigger
CREATE OR REPLACE FUNCTION public.fn_audit_workflow_signal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_events (action, entity, entity_id, user_id, details)
  VALUES (
    'workflow_signal_generated',
    'workflow_optimisation_signals',
    NEW.id::text,
    NULL,
    jsonb_build_object(
      'tenant_id', NEW.tenant_id,
      'signal_type', NEW.signal_type,
      'signal_severity', NEW.signal_severity,
      'consultant_user_id', NEW.consultant_user_id
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_workflow_signal
  AFTER INSERT ON public.workflow_optimisation_signals
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_audit_workflow_signal();
