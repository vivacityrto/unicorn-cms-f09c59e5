DROP VIEW IF EXISTS v_audit_schedule;

CREATE VIEW v_audit_schedule AS
WITH last_chc AS (
  SELECT DISTINCT ON (subject_tenant_id)
    subject_tenant_id,
    id AS last_audit_id,
    conducted_at AS last_conducted_at,
    next_audit_due,
    risk_rating AS last_risk_rating,
    score_pct AS last_score_pct
  FROM client_audits
  WHERE audit_type IN ('compliance_health_check', 'cricos_chc', 'rto_cricos_chc')
    AND status = 'complete'
  ORDER BY subject_tenant_id, conducted_at DESC NULLS LAST
),
active_chc AS (
  SELECT DISTINCT ON (subject_tenant_id)
    subject_tenant_id,
    id AS active_audit_id,
    status AS active_status
  FROM client_audits
  WHERE audit_type IN ('compliance_health_check', 'cricos_chc', 'rto_cricos_chc')
    AND status IN ('draft', 'in_progress', 'review')
  ORDER BY subject_tenant_id, created_at DESC
)
SELECT
  t.id AS tenant_id,
  t.name AS client_name,
  t.rto_id,
  t.cricos_id,
  t.risk_level AS client_risk_level,
  trs.registration_end_date,
  lc.last_audit_id,
  lc.last_conducted_at,
  lc.last_risk_rating,
  lc.last_score_pct,
  COALESCE(
    lc.next_audit_due,
    (lc.last_conducted_at + interval '1 year')::date,
    (trs.registration_end_date - interval '3 months')::date
  ) AS next_due_date,
  COALESCE(
    lc.next_audit_due,
    (lc.last_conducted_at + interval '1 year')::date,
    (trs.registration_end_date - interval '3 months')::date
  ) - CURRENT_DATE AS days_until_due,
  ac.active_audit_id,
  ac.active_status,
  CASE
    WHEN ac.active_audit_id IS NOT NULL THEN 'in_progress'
    WHEN lc.last_conducted_at IS NULL THEN 'never_audited'
    WHEN COALESCE(lc.next_audit_due, (lc.last_conducted_at + interval '1 year')::date) < CURRENT_DATE THEN 'overdue'
    WHEN COALESCE(lc.next_audit_due, (lc.last_conducted_at + interval '1 year')::date) <= (CURRENT_DATE + 90) THEN 'due_soon'
    ELSE 'on_track'
  END AS schedule_status
FROM tenants t
LEFT JOIN tga_rto_summary trs ON trs.tenant_id = t.id
LEFT JOIN last_chc lc ON lc.subject_tenant_id = t.id
LEFT JOIN active_chc ac ON ac.subject_tenant_id = t.id
WHERE t.is_system_tenant IS DISTINCT FROM true
  AND t.archived_at IS NULL;