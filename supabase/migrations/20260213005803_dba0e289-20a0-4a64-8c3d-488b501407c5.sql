
-- Drop executive view first since we're adding columns
DROP VIEW IF EXISTS public.v_executive_client_health CASCADE;
DROP VIEW IF EXISTS public.v_executive_watchlist_7d CASCADE;
DROP VIEW IF EXISTS public.v_compliance_score_deltas_7d CASCADE;
DROP VIEW IF EXISTS public.v_predictive_risk_deltas_7d CASCADE;

-- Compliance T0/T7
CREATE OR REPLACE VIEW public.v_compliance_score_t0_t7
WITH (security_invoker = true) AS
WITH latest AS (
  SELECT DISTINCT ON (tenant_id, package_instance_id)
    tenant_id, package_instance_id,
    id AS t0_id, overall_score AS t0_overall_score,
    phase_completion AS t0_phase_completion,
    documentation_coverage AS t0_documentation_coverage,
    risk_health AS t0_risk_health, consult_health AS t0_consult_health,
    days_stale AS t0_days_stale, calculated_at AS t0_calculated_at
  FROM compliance_score_snapshots
  ORDER BY tenant_id, package_instance_id, calculated_at DESC
),
t7 AS (
  SELECT s.tenant_id, s.package_instance_id,
    s.id AS t7_id, s.overall_score AS t7_overall_score,
    s.phase_completion AS t7_phase_completion,
    s.documentation_coverage AS t7_documentation_coverage,
    s.risk_health AS t7_risk_health, s.consult_health AS t7_consult_health,
    s.days_stale AS t7_days_stale, s.calculated_at AS t7_calculated_at,
    row_number() OVER (PARTITION BY s.tenant_id, s.package_instance_id
      ORDER BY abs(extract(epoch FROM (s.calculated_at - (now() - interval '7 days')))) ASC) AS rn
  FROM compliance_score_snapshots s WHERE s.calculated_at <= now()
)
SELECT l.*, t.t7_id, t.t7_overall_score, t.t7_phase_completion, t.t7_documentation_coverage,
  t.t7_risk_health, t.t7_consult_health, t.t7_days_stale, t.t7_calculated_at
FROM latest l LEFT JOIN t7 t ON t.tenant_id = l.tenant_id AND t.package_instance_id = l.package_instance_id AND t.rn = 1;

-- Predictive T0/T7
CREATE OR REPLACE VIEW public.v_predictive_risk_t0_t7
WITH (security_invoker = true) AS
WITH latest AS (
  SELECT DISTINCT ON (tenant_id, package_instance_id)
    tenant_id, package_instance_id, id AS t0_id,
    operational_risk_score AS t0_operational_risk_score,
    risk_band AS t0_risk_band, calculated_at AS t0_calculated_at
  FROM predictive_operational_risk_snapshots
  ORDER BY tenant_id, package_instance_id, calculated_at DESC
),
t7 AS (
  SELECT s.tenant_id, s.package_instance_id, s.id AS t7_id,
    s.operational_risk_score AS t7_operational_risk_score,
    s.risk_band AS t7_risk_band, s.calculated_at AS t7_calculated_at,
    row_number() OVER (PARTITION BY s.tenant_id, s.package_instance_id
      ORDER BY abs(extract(epoch FROM (s.calculated_at - (now() - interval '7 days')))) ASC) AS rn
  FROM predictive_operational_risk_snapshots s WHERE s.calculated_at <= now()
)
SELECT l.*, t.t7_id, t.t7_operational_risk_score, t.t7_risk_band, t.t7_calculated_at
FROM latest l LEFT JOIN t7 t ON t.tenant_id = l.tenant_id AND t.package_instance_id = l.package_instance_id AND t.rn = 1;

-- Compliance deltas
CREATE VIEW public.v_compliance_score_deltas_7d
WITH (security_invoker = true) AS
SELECT tenant_id, package_instance_id,
  t0_overall_score, t7_overall_score,
  (t0_overall_score - COALESCE(t7_overall_score, t0_overall_score)) AS delta_overall_score_7d,
  t0_phase_completion,
  (t0_phase_completion - COALESCE(t7_phase_completion, t0_phase_completion)) AS delta_phase_completion_7d,
  t0_documentation_coverage,
  (t0_documentation_coverage - COALESCE(t7_documentation_coverage, t0_documentation_coverage)) AS delta_docs_coverage_7d,
  t0_risk_health,
  (t0_risk_health - COALESCE(t7_risk_health, t0_risk_health)) AS delta_risk_health_7d,
  t0_consult_health,
  (t0_consult_health - COALESCE(t7_consult_health, t0_consult_health)) AS delta_consult_health_7d,
  t0_days_stale, t7_days_stale,
  (t0_days_stale - COALESCE(t7_days_stale, t0_days_stale)) AS delta_days_stale_7d,
  t0_calculated_at, t7_calculated_at
FROM v_compliance_score_t0_t7;

-- Predictive deltas
CREATE VIEW public.v_predictive_risk_deltas_7d
WITH (security_invoker = true) AS
SELECT tenant_id, package_instance_id,
  t0_operational_risk_score, t7_operational_risk_score,
  (t0_operational_risk_score - COALESCE(t7_operational_risk_score, t0_operational_risk_score)) AS delta_operational_risk_7d,
  t0_risk_band, t7_risk_band,
  CASE WHEN t7_risk_band IS NULL THEN 'no_baseline'
       WHEN t0_risk_band = t7_risk_band THEN 'no_change'
       ELSE 'changed' END AS risk_band_change_7d,
  t0_calculated_at, t7_calculated_at
FROM v_predictive_risk_t0_t7;

-- Watchlist
CREATE VIEW public.v_executive_watchlist_7d
WITH (security_invoker = true) AS
SELECT cd.tenant_id, cd.package_instance_id,
  'compliance_drop'::text AS change_type, cd.delta_overall_score_7d::int AS change_value,
  cd.t7_overall_score::int AS baseline_value, cd.t0_overall_score::int AS current_value
FROM v_compliance_score_deltas_7d cd WHERE cd.delta_overall_score_7d <= -10
UNION ALL
SELECT rd.tenant_id, rd.package_instance_id,
  'risk_band_worsened'::text, rd.delta_operational_risk_7d::int,
  rd.t7_operational_risk_score::int, rd.t0_operational_risk_score::int
FROM v_predictive_risk_deltas_7d rd
WHERE rd.risk_band_change_7d = 'changed'
  AND ((rd.t0_risk_band = 'immediate_attention' AND rd.t7_risk_band IN ('at_risk','watch','stable'))
    OR (rd.t0_risk_band = 'at_risk' AND rd.t7_risk_band IN ('watch','stable'))
    OR (rd.t0_risk_band = 'watch' AND rd.t7_risk_band = 'stable'))
UNION ALL
SELECT rd.tenant_id, rd.package_instance_id,
  'predictive_spike'::text, rd.delta_operational_risk_7d::int,
  rd.t7_operational_risk_score::int, rd.t0_operational_risk_score::int
FROM v_predictive_risk_deltas_7d rd WHERE rd.delta_operational_risk_7d >= 15
UNION ALL
SELECT cd.tenant_id, cd.package_instance_id,
  'newly_stale'::text, cd.t0_days_stale::int,
  COALESCE(cd.t7_days_stale, 0)::int, cd.t0_days_stale::int
FROM v_compliance_score_deltas_7d cd WHERE COALESCE(cd.t7_days_stale, 0) <= 14 AND cd.t0_days_stale > 14;

-- Executive view with deltas
CREATE VIEW public.v_executive_client_health
WITH (security_invoker = true) AS
SELECT
  pi.tenant_id, pi.id AS package_instance_id, pi.package_id,
  t.name AS client_name, p.name AS package_name, p.package_type,
  pi.manager_id AS owner_user_uuid,
  COALESCE(cs.overall_score, 0) AS overall_score,
  COALESCE(cs.phase_completion, 0) AS phase_completion,
  COALESCE(cs.documentation_coverage, 0) AS documentation_coverage,
  COALESCE(cs.risk_health, 0) AS risk_health,
  COALESCE(cs.consult_health, 0) AS consult_health,
  COALESCE(cs.days_stale, 0) AS days_stale,
  cs.caps_applied, cs.calculated_at AS compliance_calculated_at,
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
  COALESCE(ar.total_actions_remaining, 0) AS total_actions_remaining,
  ar.phase_name AS current_phase,
  COALESCE(dp.documents_pending_upload, 0) AS documents_pending_upload,
  COALESCE(rs.active_critical, 0) > 0 AS has_active_critical,
  COALESCE(rs.active_risks, 0) AS active_risks,
  COALESCE(chr.hours_remaining, 0) AS hours_remaining,
  COALESCE(chr.hours_included, 0) AS hours_included,
  COALESCE(cd.delta_overall_score_7d, 0) AS delta_overall_score_7d,
  COALESCE(cd.delta_phase_completion_7d, 0) AS delta_phase_completion_7d,
  COALESCE(cd.delta_docs_coverage_7d, 0) AS delta_docs_coverage_7d,
  COALESCE(cd.delta_risk_health_7d, 0) AS delta_risk_health_7d,
  COALESCE(cd.delta_consult_health_7d, 0) AS delta_consult_health_7d,
  COALESCE(cd.delta_days_stale_7d, 0) AS delta_days_stale_7d,
  COALESCE(rd.delta_operational_risk_7d, 0) AS delta_operational_risk_7d,
  COALESCE(rd.risk_band_change_7d, 'no_baseline') AS risk_band_change_7d,
  cd.t7_calculated_at AS compliance_baseline_at,
  rd.t7_calculated_at AS predictive_baseline_at,
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
LEFT JOIN v_compliance_score_deltas_7d cd ON cd.tenant_id = pi.tenant_id AND cd.package_instance_id = pi.id
LEFT JOIN v_predictive_risk_deltas_7d rd ON rd.tenant_id = pi.tenant_id AND rd.package_instance_id = pi.id
WHERE pi.is_complete = false;
