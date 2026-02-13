
-- ============================================================
-- compliance_score_snapshots: audit-ready scoring history
-- ============================================================
CREATE TABLE public.compliance_score_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  package_instance_id bigint NOT NULL REFERENCES public.package_instances(id),
  phase_completion int NOT NULL DEFAULT 0,
  documentation_coverage int NOT NULL DEFAULT 0,
  risk_health int NOT NULL DEFAULT 0,
  consult_health int NOT NULL DEFAULT 0,
  overall_score int NOT NULL DEFAULT 0,
  days_stale int NOT NULL DEFAULT 0,
  caps_applied jsonb NOT NULL DEFAULT '[]',
  inputs jsonb NOT NULL DEFAULT '{}',
  calculated_at timestamptz NOT NULL DEFAULT now(),
  calculated_by_user_uuid uuid NULL
);

CREATE INDEX idx_compliance_score_tenant_pkg_calc
  ON public.compliance_score_snapshots (tenant_id, package_instance_id, calculated_at DESC);

ALTER TABLE public.compliance_score_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view compliance scores"
  ON public.compliance_score_snapshots FOR SELECT
  USING (has_tenant_access_safe(tenant_id, auth.uid()));

CREATE POLICY "Authenticated users can insert compliance scores"
  ON public.compliance_score_snapshots FOR INSERT
  WITH CHECK (has_tenant_access_safe(tenant_id, auth.uid()));

-- ============================================================
-- calculate_compliance_score: deterministic scoring function
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculate_compliance_score(
  p_tenant_id bigint,
  p_package_instance_id bigint,
  p_actor_user_uuid uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_package_id bigint;
  -- Phase completion
  v_total_stages int;
  v_completed_stages int;
  v_phase_completion int;
  -- Documentation
  v_total_required_docs int;
  v_present_docs int;
  v_documentation_coverage int;
  -- Risk
  v_risk_points numeric;
  v_risk_health int;
  -- Consult
  v_hours_included numeric;
  v_hours_used numeric;
  v_hours_added numeric;
  v_total_hours numeric;
  v_usage numeric;
  v_consult_health int;
  -- Freshness
  v_last_activity timestamptz;
  v_days_stale int;
  v_stale_cap int;
  -- Overall
  v_overall_score numeric;
  v_caps_applied jsonb;
  -- Counts for critical risk check
  v_critical_risk_count int;
  v_missing_ratio numeric;
  v_current_phase_pct int;
  -- Result
  v_snapshot_id uuid;
  v_result jsonb;
BEGIN
  -- Resolve package_id from instance
  SELECT package_id INTO v_package_id
  FROM package_instances
  WHERE id = p_package_instance_id AND tenant_id = p_tenant_id;

  IF v_package_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Package instance not found');
  END IF;

  v_caps_applied := '[]'::jsonb;

  -- ============================================================
  -- 1. PHASE COMPLETION
  -- Uses client_package_stage_state for the tenant+package
  -- ============================================================
  SELECT
    COUNT(*) FILTER (WHERE is_required = true),
    COUNT(*) FILTER (WHERE is_required = true AND status = 'complete')
  INTO v_total_stages, v_completed_stages
  FROM client_package_stage_state
  WHERE tenant_id = p_tenant_id AND package_id = v_package_id;

  IF v_total_stages = 0 THEN
    v_phase_completion := 0;
  ELSE
    v_phase_completion := LEAST(100, ROUND((v_completed_stages::numeric / v_total_stages) * 100));
  END IF;

  -- ============================================================
  -- 2. DOCUMENTATION COVERAGE
  -- stage_documents.is_required + document_instances presence
  -- ============================================================
  SELECT
    COUNT(*) FILTER (WHERE sd.is_required = true),
    COUNT(*) FILTER (WHERE sd.is_required = true AND di.id IS NOT NULL)
  INTO v_total_required_docs, v_present_docs
  FROM stage_documents sd
  JOIN package_stages ps ON ps.stage_id = sd.stage_id AND ps.package_id = v_package_id
  LEFT JOIN document_instances di ON di.document_id = sd.document_id AND di.tenant_id = p_tenant_id;

  IF v_total_required_docs = 0 THEN
    v_documentation_coverage := 100; -- No required docs means full coverage
  ELSE
    v_documentation_coverage := LEAST(100, ROUND((v_present_docs::numeric / v_total_required_docs) * 100));
  END IF;

  -- ============================================================
  -- 3. RISK HEALTH
  -- eos_issues for this tenant, not deleted
  -- severity weights: low=5, medium=15, high=30, critical=50
  -- overdue multiplier 1.25
  -- ============================================================
  SELECT COALESCE(SUM(
    CASE
      WHEN impact = 'Critical' THEN 50
      WHEN impact = 'High' OR impact = 'high' THEN 30
      WHEN impact = 'Medium' OR impact = 'medium' THEN 15
      ELSE 5
    END
    * CASE WHEN status != 'Closed' AND resolved_at IS NULL THEN 1.0 ELSE 0.0 END
    * CASE WHEN status != 'Closed' AND resolved_at IS NULL
              AND escalated_at IS NOT NULL AND escalated_at < now() THEN 1.25 ELSE 1.0 END
  ), 0)
  INTO v_risk_points
  FROM eos_issues
  WHERE tenant_id = p_tenant_id AND deleted_at IS NULL;

  v_risk_health := GREATEST(0, LEAST(100, ROUND(100 - (v_risk_points / 100.0) * 100)));

  -- Count critical active risks for gate rule
  SELECT COUNT(*)
  INTO v_critical_risk_count
  FROM eos_issues
  WHERE tenant_id = p_tenant_id
    AND deleted_at IS NULL
    AND status != 'Closed'
    AND resolved_at IS NULL
    AND (impact = 'Critical' OR impact = 'critical');

  -- ============================================================
  -- 4. CONSULT HEALTH
  -- From package_instances hours
  -- ============================================================
  SELECT
    COALESCE(hours_included, 0),
    COALESCE(hours_used, 0),
    COALESCE(hours_added, 0)
  INTO v_hours_included, v_hours_used, v_hours_added
  FROM package_instances
  WHERE id = p_package_instance_id AND tenant_id = p_tenant_id;

  v_total_hours := v_hours_included + v_hours_added;

  IF v_total_hours = 0 THEN
    v_consult_health := 100;
  ELSE
    v_usage := v_hours_used / v_total_hours;
    IF v_usage <= 0.85 THEN
      v_consult_health := 100;
    ELSIF v_usage <= 1.0 THEN
      v_consult_health := ROUND(100 - ((v_usage - 0.85) / 0.15) * 30);
    ELSIF v_usage <= 1.2 THEN
      v_consult_health := ROUND(70 - ((v_usage - 1.0) / 0.2) * 40);
    ELSE
      v_consult_health := 0;
    END IF;
  END IF;

  v_consult_health := GREATEST(0, LEAST(100, v_consult_health));

  -- ============================================================
  -- 5. FRESHNESS
  -- ============================================================
  SELECT GREATEST(
    COALESCE((SELECT MAX(updated_at) FROM client_package_stage_state WHERE tenant_id = p_tenant_id AND package_id = v_package_id), '1970-01-01'::timestamptz),
    COALESCE((SELECT MAX(di.updated_at) FROM document_instances di WHERE di.tenant_id = p_tenant_id), '1970-01-01'::timestamptz),
    COALESCE((SELECT MAX(updated_at) FROM eos_issues WHERE tenant_id = p_tenant_id AND deleted_at IS NULL), '1970-01-01'::timestamptz),
    COALESCE((SELECT MAX(created_at) FROM time_entries WHERE tenant_id = p_tenant_id::int AND package_id = v_package_id::int), '1970-01-01'::timestamptz)
  ) INTO v_last_activity;

  v_days_stale := EXTRACT(DAY FROM (now() - v_last_activity))::int;

  IF v_days_stale <= 14 THEN
    v_stale_cap := 100;
  ELSIF v_days_stale <= 30 THEN
    v_stale_cap := 85;
    v_caps_applied := v_caps_applied || jsonb_build_object('type', 'staleness', 'cap', 85, 'days', v_days_stale);
  ELSIF v_days_stale <= 60 THEN
    v_stale_cap := 70;
    v_caps_applied := v_caps_applied || jsonb_build_object('type', 'staleness', 'cap', 70, 'days', v_days_stale);
  ELSE
    v_stale_cap := 50;
    v_caps_applied := v_caps_applied || jsonb_build_object('type', 'staleness', 'cap', 50, 'days', v_days_stale);
  END IF;

  -- ============================================================
  -- 6. WEIGHTED OVERALL
  -- ============================================================
  v_overall_score := 0.40 * v_phase_completion
                   + 0.25 * v_documentation_coverage
                   + 0.25 * v_risk_health
                   + 0.10 * v_consult_health;

  -- ============================================================
  -- 7. GATE RULES (caps stack by minimum)
  -- ============================================================

  -- 5.1 Critical risk override: cap at 60
  IF v_critical_risk_count > 0 THEN
    v_overall_score := LEAST(v_overall_score, 60);
    v_caps_applied := v_caps_applied || jsonb_build_object('type', 'critical_risk', 'cap', 60, 'count', v_critical_risk_count);
  END IF;

  -- 5.2 Missing required docs > 20%: cap at 70
  IF v_total_required_docs > 0 THEN
    v_missing_ratio := 1.0 - (v_present_docs::numeric / v_total_required_docs);
    IF v_missing_ratio > 0.20 THEN
      v_overall_score := LEAST(v_overall_score, 70);
      v_caps_applied := v_caps_applied || jsonb_build_object('type', 'missing_docs', 'cap', 70, 'missing_pct', ROUND(v_missing_ratio * 100));
    END IF;
  END IF;

  -- 5.3 Phase lock: current phase < 60%: cap at 75
  v_current_phase_pct := v_phase_completion;
  IF v_current_phase_pct < 60 AND v_total_stages > 0 THEN
    v_overall_score := LEAST(v_overall_score, 75);
    v_caps_applied := v_caps_applied || jsonb_build_object('type', 'phase_lock', 'cap', 75, 'pct', v_current_phase_pct);
  END IF;

  -- 5.4 Staleness cap
  v_overall_score := LEAST(v_overall_score, v_stale_cap);

  -- Final clamp and round
  v_overall_score := GREATEST(0, LEAST(100, ROUND(v_overall_score)));

  -- ============================================================
  -- 8. PERSIST SNAPSHOT
  -- ============================================================
  INSERT INTO compliance_score_snapshots (
    tenant_id, package_instance_id,
    phase_completion, documentation_coverage, risk_health, consult_health,
    overall_score, days_stale, caps_applied, inputs,
    calculated_by_user_uuid
  ) VALUES (
    p_tenant_id, p_package_instance_id,
    v_phase_completion, v_documentation_coverage, v_risk_health, v_consult_health,
    v_overall_score::int, v_days_stale, v_caps_applied,
    jsonb_build_object(
      'total_stages', v_total_stages,
      'completed_stages', v_completed_stages,
      'total_required_docs', v_total_required_docs,
      'present_docs', v_present_docs,
      'risk_points', v_risk_points,
      'hours_included', v_hours_included,
      'hours_used', v_hours_used,
      'hours_added', v_hours_added,
      'critical_risk_count', v_critical_risk_count,
      'last_activity', v_last_activity
    ),
    p_actor_user_uuid
  )
  RETURNING id INTO v_snapshot_id;

  -- Audit log
  INSERT INTO audit_events (entity, entity_id, action, user_id, details)
  VALUES (
    'compliance_score',
    v_snapshot_id::text,
    'compliance_score_calculated',
    p_actor_user_uuid,
    jsonb_build_object(
      'tenant_id', p_tenant_id,
      'package_instance_id', p_package_instance_id,
      'overall_score', v_overall_score,
      'trigger', 'user_triggered'
    )
  );

  -- Build result
  v_result := jsonb_build_object(
    'id', v_snapshot_id,
    'overall_score', v_overall_score,
    'phase_completion', v_phase_completion,
    'documentation_coverage', v_documentation_coverage,
    'risk_health', v_risk_health,
    'consult_health', v_consult_health,
    'days_stale', v_days_stale,
    'caps_applied', v_caps_applied,
    'inputs', jsonb_build_object(
      'total_stages', v_total_stages,
      'completed_stages', v_completed_stages,
      'total_required_docs', v_total_required_docs,
      'present_docs', v_present_docs,
      'risk_points', v_risk_points,
      'hours_included', v_hours_included,
      'hours_used', v_hours_used,
      'hours_added', v_hours_added,
      'critical_risk_count', v_critical_risk_count,
      'last_activity', v_last_activity
    )
  );

  RETURN v_result;
END;
$$;

-- ============================================================
-- v_compliance_score_latest: most recent snapshot per package
-- ============================================================
CREATE OR REPLACE VIEW public.v_compliance_score_latest
WITH (security_invoker = true)
AS
SELECT DISTINCT ON (tenant_id, package_instance_id)
  id,
  tenant_id,
  package_instance_id,
  phase_completion,
  documentation_coverage,
  risk_health,
  consult_health,
  overall_score,
  days_stale,
  caps_applied,
  inputs,
  calculated_at,
  calculated_by_user_uuid
FROM compliance_score_snapshots
ORDER BY tenant_id, package_instance_id, calculated_at DESC;
