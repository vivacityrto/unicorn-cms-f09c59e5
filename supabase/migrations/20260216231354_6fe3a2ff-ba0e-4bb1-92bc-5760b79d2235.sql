
-- Phase 20: Autonomous Strategic Orchestration Layer

-- 1) strategic_priorities
CREATE TABLE public.strategic_priorities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  priority_type text NOT NULL CHECK (priority_type IN (
    'compliance_cluster','capacity_crisis','regulator_exposure',
    'retention_threat','systemic_clause_spike','operational_breakdown'
  )),
  severity_level text NOT NULL DEFAULT 'elevated' CHECK (severity_level IN ('elevated','high','critical')),
  impact_scope text NOT NULL DEFAULT 'tenant' CHECK (impact_scope IN ('tenant','multi_tenant','portfolio')),
  affected_entities_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_actions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  priority_summary text NOT NULL DEFAULT '',
  dedupe_hash text,
  resolved_flag boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_strategic_priorities_resolved ON public.strategic_priorities(resolved_flag);
CREATE INDEX idx_strategic_priorities_type ON public.strategic_priorities(priority_type);
CREATE UNIQUE INDEX idx_strategic_priorities_dedupe ON public.strategic_priorities(dedupe_hash) WHERE dedupe_hash IS NOT NULL AND resolved_flag = false;

ALTER TABLE public.strategic_priorities ENABLE ROW LEVEL SECURITY;

-- Only Vivacity internal staff can see priorities
CREATE POLICY "vivacity_staff_select_priorities"
  ON public.strategic_priorities FOR SELECT
  TO authenticated
  USING (public.is_vivacity_internal_safe(auth.uid()));

CREATE POLICY "vivacity_staff_update_priorities"
  ON public.strategic_priorities FOR UPDATE
  TO authenticated
  USING (public.is_vivacity_internal_safe(auth.uid()));

CREATE POLICY "service_insert_priorities"
  ON public.strategic_priorities FOR INSERT
  TO authenticated
  WITH CHECK (public.is_vivacity_internal_safe(auth.uid()));

-- 2) strategic_decision_log
CREATE TABLE public.strategic_decision_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  priority_id uuid NOT NULL REFERENCES public.strategic_priorities(id) ON DELETE CASCADE,
  decision_summary text NOT NULL,
  action_taken text NOT NULL DEFAULT '',
  outcome_review_date date,
  recorded_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.strategic_decision_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vivacity_staff_select_decisions"
  ON public.strategic_decision_log FOR SELECT
  TO authenticated
  USING (public.is_vivacity_internal_safe(auth.uid()));

CREATE POLICY "vivacity_staff_insert_decisions"
  ON public.strategic_decision_log FOR INSERT
  TO authenticated
  WITH CHECK (public.is_vivacity_internal_safe(auth.uid()));

-- 3) Audit function
CREATE OR REPLACE FUNCTION public.fn_audit_strategic_orchestration(
  p_actor_user_id uuid,
  p_priority_id uuid,
  p_action text,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_events (user_id, entity, entity_id, action, details)
  VALUES (p_actor_user_id, 'strategic_priority', COALESCE(p_priority_id::text, 'system'), p_action, p_metadata);
END;
$$;

-- 4) Materialized view for effectiveness tracking
CREATE MATERIALIZED VIEW public.v_strategic_orchestration_summary AS
SELECT
  priority_type,
  severity_level,
  impact_scope,
  COUNT(*) AS total_count,
  COUNT(*) FILTER (WHERE resolved_flag) AS resolved_count,
  COUNT(*) FILTER (WHERE NOT resolved_flag) AS active_count,
  AVG(EXTRACT(EPOCH FROM (COALESCE(resolved_at, now()) - created_at)) / 3600)::numeric(10,1) AS avg_hours_to_resolve,
  COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days') AS last_30d_count,
  COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days' AND resolved_flag) AS last_30d_resolved
FROM public.strategic_priorities
GROUP BY priority_type, severity_level, impact_scope;

CREATE UNIQUE INDEX idx_v_strategic_orch_summary ON public.v_strategic_orchestration_summary(priority_type, severity_level, impact_scope);
