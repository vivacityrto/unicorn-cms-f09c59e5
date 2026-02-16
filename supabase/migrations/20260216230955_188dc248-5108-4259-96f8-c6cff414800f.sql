
-- Phase 19: Adaptive Compliance Playbooks

-- 1) compliance_playbooks
CREATE TABLE public.compliance_playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  trigger_type text NOT NULL CHECK (trigger_type IN (
    'clause_cluster','repeated_evidence_gap','regulator_overlap',
    'stage_stagnation','high_risk_forecast'
  )),
  related_standard_clauses text[] DEFAULT '{}',
  severity_level text NOT NULL DEFAULT 'moderate' CHECK (severity_level IN ('moderate','high','critical')),
  active_flag boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.compliance_playbooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "playbooks_vivacity_select" ON public.compliance_playbooks
  FOR SELECT USING (public.is_vivacity_internal_safe(auth.uid()));
CREATE POLICY "playbooks_vivacity_insert" ON public.compliance_playbooks
  FOR INSERT WITH CHECK (public.is_vivacity_internal_safe(auth.uid()));
CREATE POLICY "playbooks_vivacity_update" ON public.compliance_playbooks
  FOR UPDATE USING (public.is_vivacity_internal_safe(auth.uid()));
CREATE POLICY "playbooks_service_insert" ON public.compliance_playbooks
  FOR INSERT WITH CHECK (true);

-- 2) playbook_steps
CREATE TABLE public.playbook_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id uuid NOT NULL REFERENCES public.compliance_playbooks(id) ON DELETE CASCADE,
  step_order integer NOT NULL DEFAULT 1,
  step_type text NOT NULL CHECK (step_type IN (
    'review','task_creation','template_review','consult_required','internal_escalation'
  )),
  step_description text NOT NULL,
  suggested_task_template_id uuid,
  requires_confirmation boolean NOT NULL DEFAULT true
);

CREATE INDEX idx_playbook_steps_playbook ON public.playbook_steps(playbook_id);

ALTER TABLE public.playbook_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pb_steps_vivacity_select" ON public.playbook_steps
  FOR SELECT USING (public.is_vivacity_internal_safe(auth.uid()));
CREATE POLICY "pb_steps_vivacity_manage" ON public.playbook_steps
  FOR ALL USING (public.is_vivacity_internal_safe(auth.uid()));
CREATE POLICY "pb_steps_service_insert" ON public.playbook_steps
  FOR INSERT WITH CHECK (true);

-- 3) playbook_triggers
CREATE TABLE public.playbook_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id uuid NOT NULL REFERENCES public.compliance_playbooks(id) ON DELETE CASCADE,
  trigger_source text NOT NULL CHECK (trigger_source IN (
    'risk_event','risk_forecast','stage_health','regulator_update','evidence_gap'
  )),
  threshold_config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_playbook_triggers_playbook ON public.playbook_triggers(playbook_id);

ALTER TABLE public.playbook_triggers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pb_triggers_vivacity_select" ON public.playbook_triggers
  FOR SELECT USING (public.is_vivacity_internal_safe(auth.uid()));
CREATE POLICY "pb_triggers_vivacity_manage" ON public.playbook_triggers
  FOR ALL USING (public.is_vivacity_internal_safe(auth.uid()));
CREATE POLICY "pb_triggers_service_insert" ON public.playbook_triggers
  FOR INSERT WITH CHECK (true);

-- 4) playbook_activations
CREATE TABLE public.playbook_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id uuid NOT NULL REFERENCES public.compliance_playbooks(id),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  stage_instance_id uuid,
  trigger_source_id uuid,
  activation_reason text NOT NULL DEFAULT '',
  activation_status text NOT NULL DEFAULT 'suggested' CHECK (activation_status IN (
    'suggested','initiated','completed','dismissed'
  )),
  current_step_order integer NOT NULL DEFAULT 0,
  adaptive_context_json jsonb DEFAULT '{}'::jsonb,
  activated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idx_pb_activations_tenant ON public.playbook_activations(tenant_id);
CREATE INDEX idx_pb_activations_playbook ON public.playbook_activations(playbook_id);
CREATE INDEX idx_pb_activations_status ON public.playbook_activations(activation_status);

ALTER TABLE public.playbook_activations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pb_activations_vivacity_select" ON public.playbook_activations
  FOR SELECT USING (public.is_vivacity_internal_safe(auth.uid()));
CREATE POLICY "pb_activations_vivacity_update" ON public.playbook_activations
  FOR UPDATE USING (public.is_vivacity_internal_safe(auth.uid()));
CREATE POLICY "pb_activations_service_insert" ON public.playbook_activations
  FOR INSERT WITH CHECK (true);

-- 5) Materialized view: playbook effectiveness
CREATE MATERIALIZED VIEW public.v_playbook_effectiveness AS
SELECT
  cp.id AS playbook_id,
  cp.name AS playbook_name,
  cp.trigger_type,
  cp.severity_level,
  COUNT(pa.id) AS total_activations,
  COUNT(pa.id) FILTER (WHERE pa.activation_status = 'suggested') AS suggested_count,
  COUNT(pa.id) FILTER (WHERE pa.activation_status = 'initiated') AS initiated_count,
  COUNT(pa.id) FILTER (WHERE pa.activation_status = 'completed') AS completed_count,
  COUNT(pa.id) FILTER (WHERE pa.activation_status = 'dismissed') AS dismissed_count,
  ROUND(
    CASE WHEN COUNT(pa.id) > 0
      THEN COUNT(pa.id) FILTER (WHERE pa.activation_status = 'initiated' OR pa.activation_status = 'completed')::numeric / COUNT(pa.id) * 100
      ELSE 0
    END, 1
  ) AS initiation_rate_pct,
  ROUND(
    CASE WHEN COUNT(pa.id) FILTER (WHERE pa.activation_status = 'initiated' OR pa.activation_status = 'completed') > 0
      THEN COUNT(pa.id) FILTER (WHERE pa.activation_status = 'completed')::numeric /
           COUNT(pa.id) FILTER (WHERE pa.activation_status = 'initiated' OR pa.activation_status = 'completed') * 100
      ELSE 0
    END, 1
  ) AS completion_rate_pct,
  ROUND(AVG(
    CASE WHEN pa.activation_status IN ('initiated','completed') AND pa.activated_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (COALESCE(pa.completed_at, now()) - pa.activated_at)) / 3600
    END
  )::numeric, 1) AS avg_hours_to_resolve
FROM public.compliance_playbooks cp
LEFT JOIN public.playbook_activations pa ON pa.playbook_id = cp.id
GROUP BY cp.id, cp.name, cp.trigger_type, cp.severity_level
WITH NO DATA;

CREATE UNIQUE INDEX idx_v_playbook_effectiveness_pk ON public.v_playbook_effectiveness(playbook_id);

-- Refresh function
CREATE OR REPLACE FUNCTION public.refresh_playbook_effectiveness()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.v_playbook_effectiveness;
END;
$$;

-- 6) Audit logging function
CREATE OR REPLACE FUNCTION public.fn_audit_playbook(
  p_actor_user_id uuid,
  p_tenant_id bigint,
  p_playbook_id uuid,
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
    'compliance_playbook',
    COALESCE(p_playbook_id::text, 'system'),
    p_actor_user_id,
    jsonb_build_object('tenant_id', p_tenant_id, 'playbook_id', p_playbook_id, 'metadata', p_metadata)
  );
END;
$$;
