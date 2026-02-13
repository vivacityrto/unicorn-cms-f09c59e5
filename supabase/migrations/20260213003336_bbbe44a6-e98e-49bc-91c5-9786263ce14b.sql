
-- ============================================================
-- v_progress_anchor_inputs: data-driven progress anchors
-- ============================================================
CREATE OR REPLACE VIEW public.v_progress_anchor_inputs
WITH (security_invoker = true)
AS
SELECT
  pi.tenant_id,
  pi.id AS package_instance_id,
  pi.package_id,
  t.name AS client_name,
  p.name AS package_name,
  COALESCE(cs.overall_score, 0) AS overall_score,
  COALESCE(cs.days_stale, 0) AS days_stale,
  COALESCE(cs.is_stale, false) AS is_stale,
  COALESCE((
    SELECT COUNT(*) FROM client_package_stage_state cpss
    WHERE cpss.tenant_id = pi.tenant_id AND cpss.package_id = pi.package_id
      AND cpss.is_required = true AND cpss.status != 'complete'
  ), 0)::int AS actions_remaining_current_phase,
  COALESCE((
    SELECT COUNT(*) FROM stage_documents sd
    JOIN client_package_stage_state cpss ON cpss.stage_id = sd.stage_id
      AND cpss.tenant_id = pi.tenant_id AND cpss.package_id = pi.package_id
    WHERE sd.is_required = true
      AND NOT EXISTS (
        SELECT 1 FROM document_instances di
        WHERE di.document_id = sd.id AND di.tenant_id = pi.tenant_id
      )
  ), 0)::int AS documents_pending_upload,
  (
    SELECT ds.title FROM client_package_stage_state cpss
    JOIN documents_stages ds ON ds.id = cpss.stage_id
    WHERE cpss.tenant_id = pi.tenant_id AND cpss.package_id = pi.package_id
      AND cpss.is_required = true AND cpss.status != 'complete'
    ORDER BY cpss.sort_order ASC LIMIT 1
  ) AS next_milestone_label,
  EXISTS (
    SELECT 1 FROM eos_issues ei
    WHERE ei.tenant_id = pi.tenant_id
      AND ei.deleted_at IS NULL
      AND ei.status NOT IN ('Solved', 'Closed', 'Archived')
      AND ei.resolved_at IS NULL
      AND (ei.impact = 'Critical' OR ei.impact = 'critical')
  ) AS has_active_critical
FROM package_instances pi
JOIN tenants t ON t.id = pi.tenant_id
JOIN packages p ON p.id = pi.package_id
LEFT JOIN v_compliance_score_latest cs ON cs.tenant_id = pi.tenant_id AND cs.package_instance_id = pi.id
WHERE pi.is_complete = false;

-- ============================================================
-- v_completion_eligibility
-- ============================================================
CREATE OR REPLACE VIEW public.v_completion_eligibility
WITH (security_invoker = true)
AS
WITH stage_counts AS (
  SELECT
    cpss.tenant_id,
    cpss.package_id,
    COUNT(*) FILTER (WHERE cpss.is_required = true) AS total_required,
    COUNT(*) FILTER (WHERE cpss.is_required = true AND cpss.status = 'complete') AS completed_required
  FROM client_package_stage_state cpss
  GROUP BY cpss.tenant_id, cpss.package_id
),
doc_counts AS (
  SELECT
    cpss.tenant_id,
    cpss.package_id,
    COUNT(*) FILTER (WHERE sd.is_required = true) AS total_required_docs,
    COUNT(*) FILTER (WHERE sd.is_required = true AND EXISTS (
      SELECT 1 FROM document_instances di
      WHERE di.document_id = sd.id AND di.tenant_id = cpss.tenant_id
    )) AS present_required_docs
  FROM client_package_stage_state cpss
  JOIN stage_documents sd ON sd.stage_id = cpss.stage_id
  GROUP BY cpss.tenant_id, cpss.package_id
)
SELECT
  pi.tenant_id,
  pi.id AS package_instance_id,
  pi.package_id,
  COALESCE(sc.total_required, 0) > 0
    AND COALESCE(sc.completed_required, 0) = COALESCE(sc.total_required, 0) AS is_final_phase_completed,
  CASE
    WHEN COALESCE(dc.total_required_docs, 0) = 0 THEN 0.0
    ELSE ROUND(1.0 - (COALESCE(dc.present_required_docs, 0)::numeric / dc.total_required_docs), 2)
  END AS missing_required_docs_ratio,
  EXISTS (
    SELECT 1 FROM eos_issues ei
    WHERE ei.tenant_id = pi.tenant_id
      AND ei.deleted_at IS NULL
      AND ei.status NOT IN ('Solved', 'Closed', 'Archived')
      AND ei.resolved_at IS NULL
      AND (ei.impact = 'Critical' OR ei.impact = 'critical')
  ) AS has_active_critical,
  (
    COALESCE(sc.total_required, 0) > 0
    AND COALESCE(sc.completed_required, 0) = COALESCE(sc.total_required, 0)
    AND NOT EXISTS (
      SELECT 1 FROM eos_issues ei
      WHERE ei.tenant_id = pi.tenant_id
        AND ei.deleted_at IS NULL
        AND ei.status NOT IN ('Solved', 'Closed', 'Archived')
        AND ei.resolved_at IS NULL
        AND (ei.impact = 'Critical' OR ei.impact = 'critical')
    )
    AND (
      COALESCE(dc.total_required_docs, 0) = 0
      OR (COALESCE(dc.present_required_docs, 0)::numeric / NULLIF(dc.total_required_docs, 0)) >= 0.80
    )
  ) AS eligible,
  ARRAY_REMOVE(ARRAY[
    CASE WHEN NOT (COALESCE(sc.total_required, 0) > 0 AND COALESCE(sc.completed_required, 0) = COALESCE(sc.total_required, 0))
      THEN 'phases_incomplete' END,
    CASE WHEN EXISTS (
      SELECT 1 FROM eos_issues ei
      WHERE ei.tenant_id = pi.tenant_id
        AND ei.deleted_at IS NULL
        AND ei.status NOT IN ('Solved', 'Closed', 'Archived')
        AND ei.resolved_at IS NULL
        AND (ei.impact = 'Critical' OR ei.impact = 'critical')
    ) THEN 'active_critical_risk' END,
    CASE WHEN COALESCE(dc.total_required_docs, 0) > 0
      AND (COALESCE(dc.present_required_docs, 0)::numeric / NULLIF(dc.total_required_docs, 0)) < 0.80
      THEN 'missing_required_docs' END
  ], NULL) AS ineligible_reasons
FROM package_instances pi
LEFT JOIN stage_counts sc ON sc.tenant_id = pi.tenant_id AND sc.package_id = pi.package_id
LEFT JOIN doc_counts dc ON dc.tenant_id = pi.tenant_id AND dc.package_id = pi.package_id
WHERE pi.is_complete = false;
