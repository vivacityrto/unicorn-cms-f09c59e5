
-- ============================================================
-- v_score_phase_items: phase completion inputs per tenant/package
-- ============================================================
CREATE OR REPLACE VIEW public.v_score_phase_items
WITH (security_invoker = true)
AS
SELECT
  cpss.tenant_id,
  cpss.package_id,
  COUNT(*) FILTER (WHERE cpss.is_required = true) AS total_stages,
  COUNT(*) FILTER (WHERE cpss.is_required = true AND cpss.status = 'complete') AS completed_stages,
  CASE
    WHEN COUNT(*) FILTER (WHERE cpss.is_required = true) = 0 THEN 0
    ELSE LEAST(100, ROUND((COUNT(*) FILTER (WHERE cpss.is_required = true AND cpss.status = 'complete')::numeric
           / NULLIF(COUNT(*) FILTER (WHERE cpss.is_required = true), 0)) * 100))::int
  END AS current_phase_completion,
  true AS data_available
FROM client_package_stage_state cpss
GROUP BY cpss.tenant_id, cpss.package_id;

-- ============================================================
-- v_score_required_docs: documentation coverage inputs
-- ============================================================
CREATE OR REPLACE VIEW public.v_score_required_docs
WITH (security_invoker = true)
AS
SELECT
  di_agg.tenant_id,
  ps.package_id,
  COUNT(*) FILTER (WHERE sd.is_required = true) AS required_total,
  COUNT(*) FILTER (WHERE sd.is_required = true AND di_agg.instance_id IS NOT NULL) AS required_present,
  true AS data_available
FROM stage_documents sd
JOIN package_stages ps ON ps.stage_id = sd.stage_id
LEFT JOIN (
  SELECT DISTINCT ON (di.document_id, di.tenant_id)
    di.document_id, di.tenant_id, di.id AS instance_id
  FROM document_instances di
  ORDER BY di.document_id, di.tenant_id, di.created_at DESC
) di_agg ON di_agg.document_id = sd.document_id
GROUP BY di_agg.tenant_id, ps.package_id;

-- ============================================================
-- v_score_risks: risk exposure inputs per tenant
-- ============================================================
CREATE OR REPLACE VIEW public.v_score_risks
WITH (security_invoker = true)
AS
SELECT
  ei.tenant_id,
  COUNT(*) FILTER (WHERE ei.impact = 'Low' OR ei.impact = 'low') AS active_low,
  COUNT(*) FILTER (WHERE ei.impact = 'Medium' OR ei.impact = 'medium') AS active_medium,
  COUNT(*) FILTER (WHERE ei.impact = 'High' OR ei.impact = 'high') AS active_high,
  COUNT(*) FILTER (WHERE ei.impact = 'Critical' OR ei.impact = 'critical') AS active_critical,
  COALESCE(SUM(
    CASE
      WHEN ei.impact IN ('Critical', 'critical') THEN 50
      WHEN ei.impact IN ('High', 'high') THEN 30
      WHEN ei.impact IN ('Medium', 'medium') THEN 15
      ELSE 5
    END
    * CASE WHEN ei.escalated_at IS NOT NULL AND ei.escalated_at < now() THEN 1.25 ELSE 1.0 END
  ), 0)::numeric AS risk_points,
  COALESCE(COUNT(*) FILTER (WHERE ei.impact IN ('Critical', 'critical')), 0) > 0 AS has_active_critical,
  true AS data_available
FROM eos_issues ei
WHERE ei.deleted_at IS NULL
  AND ei.status NOT IN ('Solved', 'Closed', 'Archived')
  AND ei.resolved_at IS NULL
GROUP BY ei.tenant_id;

-- ============================================================
-- v_score_consult: consult usage inputs per tenant/package_instance
-- ============================================================
CREATE OR REPLACE VIEW public.v_score_consult
WITH (security_invoker = true)
AS
SELECT
  pi.tenant_id,
  pi.id AS package_instance_id,
  pi.package_id,
  COALESCE(pi.hours_included, 0) AS hours_included,
  COALESCE(pi.hours_used, 0)::numeric AS hours_used,
  COALESCE(pi.hours_added, 0) AS hours_added,
  CASE
    WHEN (COALESCE(pi.hours_included, 0) + COALESCE(pi.hours_added, 0)) = 0 THEN 0
    ELSE ROUND(COALESCE(pi.hours_used, 0)::numeric / (COALESCE(pi.hours_included, 0) + COALESCE(pi.hours_added, 0))::numeric, 4)
  END AS usage_ratio,
  true AS data_available
FROM package_instances pi
WHERE pi.is_complete = false;

-- ============================================================
-- v_score_last_activity: freshness per tenant/package
-- ============================================================
CREATE OR REPLACE VIEW public.v_score_last_activity
WITH (security_invoker = true)
AS
SELECT
  t.tenant_id,
  t.package_id,
  GREATEST(
    COALESCE(t.stage_activity, '1970-01-01'::timestamptz),
    COALESCE(t.doc_activity, '1970-01-01'::timestamptz),
    COALESCE(t.risk_activity, '1970-01-01'::timestamptz),
    COALESCE(t.time_activity, '1970-01-01'::timestamptz)
  ) AS last_activity_at,
  EXTRACT(DAY FROM (now() - GREATEST(
    COALESCE(t.stage_activity, '1970-01-01'::timestamptz),
    COALESCE(t.doc_activity, '1970-01-01'::timestamptz),
    COALESCE(t.risk_activity, '1970-01-01'::timestamptz),
    COALESCE(t.time_activity, '1970-01-01'::timestamptz)
  )))::int AS days_stale,
  true AS data_available
FROM (
  SELECT
    cpss.tenant_id,
    cpss.package_id,
    MAX(cpss.updated_at) AS stage_activity,
    (SELECT MAX(di.updated_at) FROM document_instances di WHERE di.tenant_id = cpss.tenant_id) AS doc_activity,
    (SELECT MAX(ei.updated_at) FROM eos_issues ei WHERE ei.tenant_id = cpss.tenant_id AND ei.deleted_at IS NULL) AS risk_activity,
    (SELECT MAX(te.created_at) FROM time_entries te WHERE te.tenant_id = cpss.tenant_id::int AND te.package_id = cpss.package_id::int) AS time_activity
  FROM client_package_stage_state cpss
  GROUP BY cpss.tenant_id, cpss.package_id
) t;

-- ============================================================
-- Update v_compliance_score_latest to include is_stale
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
  calculated_by_user_uuid,
  (days_stale > 14) AS is_stale
FROM compliance_score_snapshots
ORDER BY tenant_id, package_instance_id, calculated_at DESC;
