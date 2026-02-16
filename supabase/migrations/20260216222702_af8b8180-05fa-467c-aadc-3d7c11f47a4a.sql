
-- ============================================================
-- Phase 9: Intelligent Stage Progress Health Monitor
-- ============================================================

-- 1) stage_health_rules – configurable thresholds
CREATE TABLE public.stage_health_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  metric_key text NOT NULL,
  threshold_value numeric NOT NULL,
  comparison_operator text NOT NULL DEFAULT '>',
  severity_impact text NOT NULL DEFAULT 'monitoring',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_comparison_op CHECK (comparison_operator IN ('>', '<', '>=', '<=', '=')),
  CONSTRAINT chk_severity CHECK (severity_impact IN ('monitoring', 'at_risk', 'critical'))
);

ALTER TABLE public.stage_health_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stage_health_rules_select_vivacity"
  ON public.stage_health_rules FOR SELECT
  USING (public.is_vivacity_team_safe(auth.uid()));

CREATE POLICY "stage_health_rules_manage_superadmin"
  ON public.stage_health_rules FOR ALL
  USING (public.is_super_admin_safe(auth.uid()));

-- Seed default rules
INSERT INTO public.stage_health_rules (rule_name, metric_key, threshold_value, comparison_operator, severity_impact) VALUES
  ('Tasks overdue > 5', 'tasks_overdue_count', 5, '>', 'at_risk'),
  ('High risks >= 3', 'high_risk_count', 3, '>=', 'at_risk'),
  ('Mandatory evidence gaps >= 2', 'evidence_gap_mandatory_count', 2, '>=', 'at_risk'),
  ('Days since activity > 14', 'days_since_last_activity', 14, '>', 'monitoring'),
  ('Days since activity > 30', 'days_since_last_activity', 30, '>', 'critical'),
  ('Tasks overdue > 10', 'tasks_overdue_count', 10, '>', 'critical');

-- 2) stage_health_snapshots – calculated health metrics
CREATE TABLE public.stage_health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL,
  stage_instance_id bigint NOT NULL,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  progress_percentage integer NOT NULL DEFAULT 0,
  tasks_open_count integer NOT NULL DEFAULT 0,
  tasks_overdue_count integer NOT NULL DEFAULT 0,
  high_risk_count integer NOT NULL DEFAULT 0,
  evidence_gap_mandatory_count integer NOT NULL DEFAULT 0,
  days_since_last_activity integer NOT NULL DEFAULT 0,
  consult_hours_logged numeric NOT NULL DEFAULT 0,
  expected_consult_hours numeric,
  health_status text NOT NULL DEFAULT 'healthy',
  generated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_health_status CHECK (health_status IN ('healthy', 'monitoring', 'at_risk', 'critical'))
);

CREATE INDEX idx_stage_health_snapshots_tenant ON public.stage_health_snapshots(tenant_id);
CREATE INDEX idx_stage_health_snapshots_stage ON public.stage_health_snapshots(stage_instance_id);
CREATE INDEX idx_stage_health_snapshots_date ON public.stage_health_snapshots(snapshot_date);
CREATE INDEX idx_stage_health_snapshots_status ON public.stage_health_snapshots(health_status);

ALTER TABLE public.stage_health_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stage_health_snapshots_select_tenant"
  ON public.stage_health_snapshots FOR SELECT
  USING (public.has_tenant_access_safe(tenant_id, auth.uid()));

CREATE POLICY "stage_health_snapshots_insert_system"
  ON public.stage_health_snapshots FOR INSERT
  WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

-- 3) Materialized view for 30-day trends
CREATE MATERIALIZED VIEW public.v_stage_health_trends AS
SELECT
  tenant_id,
  health_status,
  COUNT(*) AS status_count,
  AVG(tasks_overdue_count) AS avg_overdue_tasks,
  AVG(high_risk_count) AS avg_risk_per_stage,
  AVG(days_since_last_activity) AS avg_days_stalled,
  AVG(progress_percentage) AS avg_progress
FROM public.stage_health_snapshots
WHERE snapshot_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY tenant_id, health_status;

CREATE INDEX idx_v_stage_health_trends_tenant ON public.v_stage_health_trends(tenant_id);

-- 4) Audit logging trigger for health status changes
CREATE OR REPLACE FUNCTION public.log_stage_health_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_events (action, entity, entity_id, details)
  VALUES (
    'stage_health_snapshot_created',
    'stage_health_snapshots',
    NEW.id::text,
    jsonb_build_object(
      'tenant_id', NEW.tenant_id,
      'stage_instance_id', NEW.stage_instance_id,
      'health_status', NEW.health_status,
      'progress_percentage', NEW.progress_percentage,
      'tasks_overdue_count', NEW.tasks_overdue_count,
      'high_risk_count', NEW.high_risk_count,
      'snapshot_date', NEW.snapshot_date
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_stage_health_change
  AFTER INSERT ON public.stage_health_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.log_stage_health_change();
