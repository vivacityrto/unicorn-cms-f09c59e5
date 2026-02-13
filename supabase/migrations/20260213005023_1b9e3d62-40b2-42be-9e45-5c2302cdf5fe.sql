
-- ============================================================
-- Executive Dashboard Supporting Views
-- ============================================================

-- 1. v_predictive_operational_risk_latest
CREATE OR REPLACE VIEW public.v_predictive_operational_risk_latest
WITH (security_invoker = true)
AS
SELECT DISTINCT ON (tenant_id, package_instance_id)
  id,
  tenant_id,
  package_instance_id,
  operational_risk_score,
  risk_band,
  activity_decay,
  severe_activity_decay,
  risk_escalation,
  backlog_growth,
  sustained_backlog_growth,
  burn_rate_risk,
  phase_drift,
  inputs,
  calculated_at
FROM predictive_operational_risk_snapshots
ORDER BY tenant_id, package_instance_id, calculated_at DESC;

-- 2. v_documents_pending
CREATE OR REPLACE VIEW public.v_documents_pending
WITH (security_invoker = true)
AS
SELECT
  d.tenant_id,
  d.package_id,
  pi.id AS package_instance_id,
  COUNT(*) FILTER (
    WHERE d.document_status IS NULL
      OR d.document_status IN ('draft', 'not_started')
      OR d.uploaded_files IS NULL
      OR array_length(d.uploaded_files, 1) IS NULL
      OR array_length(d.uploaded_files, 1) = 0
  ) AS documents_pending_upload
FROM documents d
JOIN package_instances pi ON pi.tenant_id = d.tenant_id AND pi.package_id = d.package_id AND pi.is_complete = false
GROUP BY d.tenant_id, d.package_id, pi.id;

-- 3. v_client_risk_summary
CREATE OR REPLACE VIEW public.v_client_risk_summary
WITH (security_invoker = true)
AS
SELECT
  ei.tenant_id,
  COUNT(*) FILTER (
    WHERE ei.status NOT IN ('Solved', 'Closed', 'Archived')
      AND ei.resolved_at IS NULL
      AND ei.deleted_at IS NULL
  ) AS active_risks,
  COUNT(*) FILTER (
    WHERE ei.status NOT IN ('Solved', 'Closed', 'Archived')
      AND ei.resolved_at IS NULL
      AND ei.deleted_at IS NULL
      AND ei.impact IN ('Critical', 'critical')
  ) AS active_critical,
  COUNT(*) FILTER (
    WHERE ei.status NOT IN ('Solved', 'Closed', 'Archived')
      AND ei.resolved_at IS NULL
      AND ei.deleted_at IS NULL
      AND ei.impact IN ('Critical', 'critical', 'High', 'high')
  ) AS high_or_critical
FROM eos_issues ei
GROUP BY ei.tenant_id;

-- 4. v_consult_hours_remaining
CREATE OR REPLACE VIEW public.v_consult_hours_remaining
WITH (security_invoker = true)
AS
SELECT
  pi.tenant_id,
  pi.id AS package_instance_id,
  pi.package_id,
  COALESCE(pi.hours_included, 0) + COALESCE(pi.hours_added, 0) AS hours_included,
  COALESCE(pi.hours_used, 0) AS hours_used,
  (COALESCE(pi.hours_included, 0) + COALESCE(pi.hours_added, 0) - COALESCE(pi.hours_used, 0)) AS hours_remaining
FROM package_instances pi
WHERE pi.is_complete = false;

-- 5. v_executive_client_health — unified executive view
CREATE OR REPLACE VIEW public.v_executive_client_health
WITH (security_invoker = true)
AS
SELECT
  pi.tenant_id,
  pi.id AS package_instance_id,
  pi.package_id,
  t.name AS client_name,
  p.name AS package_name,
  p.package_type,
  pi.manager_id AS owner_user_uuid,
  -- Compliance score
  COALESCE(cs.overall_score, 0) AS overall_score,
  COALESCE(cs.phase_completion, 0) AS phase_completion,
  COALESCE(cs.documentation_coverage, 0) AS documentation_coverage,
  COALESCE(cs.risk_health, 0) AS risk_health,
  COALESCE(cs.consult_health, 0) AS consult_health,
  COALESCE(cs.days_stale, 0) AS days_stale,
  cs.caps_applied,
  cs.calculated_at AS compliance_calculated_at,
  -- Predictive risk
  COALESCE(pr.operational_risk_score, 0) AS operational_risk_score,
  COALESCE(pr.risk_band, 'stable') AS risk_band,
  jsonb_build_object(
    'activity_decay', COALESCE(pr.activity_decay, false),
    'severe_activity_decay', COALESCE(pr.severe_activity_decay, false),
    'risk_escalation', COALESCE(pr.risk_escalation, false),
    'backlog_growth', COALESCE(pr.backlog_growth, false),
    'sustained_backlog_growth', COALESCE(pr.sustained_backlog_growth, false),
    'burn_rate_risk', COALESCE(pr.burn_rate_risk, false),
    'phase_drift', COALESCE(pr.phase_drift, false)
  ) AS predictive_flags,
  pr.calculated_at AS predictive_calculated_at,
  -- Actions remaining
  COALESCE(ar.total_actions_remaining, 0) AS total_actions_remaining,
  ar.phase_name AS current_phase,
  -- Documents pending
  COALESCE(dp.documents_pending_upload, 0) AS documents_pending_upload,
  -- Risk summary
  COALESCE(rs.active_critical, 0) > 0 AS has_active_critical,
  COALESCE(rs.active_risks, 0) AS active_risks,
  -- Consult hours
  COALESCE(chr.hours_remaining, 0) AS hours_remaining,
  COALESCE(chr.hours_included, 0) AS hours_included,
  -- Updated at
  GREATEST(cs.calculated_at, pr.calculated_at) AS updated_at
FROM package_instances pi
JOIN tenants t ON t.id = pi.tenant_id
JOIN packages p ON p.id = pi.package_id
LEFT JOIN v_compliance_score_latest cs ON cs.tenant_id = pi.tenant_id AND cs.package_instance_id = pi.id
LEFT JOIN v_predictive_operational_risk_latest pr ON pr.tenant_id = pi.tenant_id AND pr.package_instance_id = pi.id
LEFT JOIN v_phase_actions_remaining ar ON ar.tenant_id = pi.tenant_id AND ar.package_instance_id = pi.id
LEFT JOIN v_documents_pending dp ON dp.tenant_id = pi.tenant_id AND dp.package_instance_id = pi.id
LEFT JOIN v_client_risk_summary rs ON rs.tenant_id = pi.tenant_id
LEFT JOIN v_consult_hours_remaining chr ON chr.tenant_id = pi.tenant_id AND chr.package_instance_id = pi.id
WHERE pi.is_complete = false;
