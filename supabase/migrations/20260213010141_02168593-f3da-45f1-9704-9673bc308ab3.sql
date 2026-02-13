
-- ============================================================
-- Delta Confidence Indicator Views
-- ============================================================

-- 1. Compliance delta confidence
CREATE OR REPLACE VIEW public.v_compliance_delta_confidence_7d
WITH (security_invoker = true) AS
WITH latest AS (
  SELECT DISTINCT ON (tenant_id, package_instance_id)
    tenant_id, package_instance_id,
    calculated_at AS t0_at
  FROM compliance_score_snapshots
  ORDER BY tenant_id, package_instance_id, calculated_at DESC
),
t7_choice AS (
  SELECT s.tenant_id, s.package_instance_id,
    s.calculated_at AS t7_at,
    abs(extract(epoch FROM (s.calculated_at - (now() - interval '7 days')))) AS t7_distance_seconds,
    row_number() OVER (
      PARTITION BY s.tenant_id, s.package_instance_id
      ORDER BY abs(extract(epoch FROM (s.calculated_at - (now() - interval '7 days')))) ASC
    ) AS rn
  FROM compliance_score_snapshots s
),
density AS (
  SELECT s.tenant_id, s.package_instance_id,
    count(*) FILTER (WHERE s.calculated_at >= now() - interval '7 days') AS snapshots_last_7d
  FROM compliance_score_snapshots s
  GROUP BY s.tenant_id, s.package_instance_id
)
SELECT
  l.tenant_id, l.package_instance_id,
  l.t0_at, t.t7_at, t.t7_distance_seconds,
  d.snapshots_last_7d,
  extract(day FROM (now() - l.t0_at))::int AS days_since_latest,
  CASE
    WHEN t.t7_at IS NULL THEN 'none'
    WHEN t.t7_distance_seconds <= 86400
      AND COALESCE(d.snapshots_last_7d, 0) >= 4
      AND (now() - l.t0_at) <= interval '2 days'
      THEN 'high'
    WHEN t.t7_distance_seconds <= 259200
      AND COALESCE(d.snapshots_last_7d, 0) >= 2
      AND (now() - l.t0_at) <= interval '5 days'
      THEN 'medium'
    ELSE 'low'
  END AS delta_confidence_7d
FROM latest l
LEFT JOIN (
  SELECT tenant_id, package_instance_id, t7_at, t7_distance_seconds
  FROM t7_choice WHERE rn = 1
) t ON t.tenant_id = l.tenant_id AND t.package_instance_id = l.package_instance_id
LEFT JOIN density d ON d.tenant_id = l.tenant_id AND d.package_instance_id = l.package_instance_id;

-- 2. Predictive delta confidence
CREATE OR REPLACE VIEW public.v_predictive_delta_confidence_7d
WITH (security_invoker = true) AS
WITH latest AS (
  SELECT DISTINCT ON (tenant_id, package_instance_id)
    tenant_id, package_instance_id,
    calculated_at AS t0_at
  FROM predictive_operational_risk_snapshots
  ORDER BY tenant_id, package_instance_id, calculated_at DESC
),
t7_choice AS (
  SELECT s.tenant_id, s.package_instance_id,
    s.calculated_at AS t7_at,
    abs(extract(epoch FROM (s.calculated_at - (now() - interval '7 days')))) AS t7_distance_seconds,
    row_number() OVER (
      PARTITION BY s.tenant_id, s.package_instance_id
      ORDER BY abs(extract(epoch FROM (s.calculated_at - (now() - interval '7 days')))) ASC
    ) AS rn
  FROM predictive_operational_risk_snapshots s
),
density AS (
  SELECT s.tenant_id, s.package_instance_id,
    count(*) FILTER (WHERE s.calculated_at >= now() - interval '7 days') AS snapshots_last_7d
  FROM predictive_operational_risk_snapshots s
  GROUP BY s.tenant_id, s.package_instance_id
)
SELECT
  l.tenant_id, l.package_instance_id,
  l.t0_at, t.t7_at, t.t7_distance_seconds,
  d.snapshots_last_7d,
  extract(day FROM (now() - l.t0_at))::int AS days_since_latest,
  CASE
    WHEN t.t7_at IS NULL THEN 'none'
    WHEN t.t7_distance_seconds <= 86400
      AND COALESCE(d.snapshots_last_7d, 0) >= 4
      AND (now() - l.t0_at) <= interval '2 days'
      THEN 'high'
    WHEN t.t7_distance_seconds <= 259200
      AND COALESCE(d.snapshots_last_7d, 0) >= 2
      AND (now() - l.t0_at) <= interval '5 days'
      THEN 'medium'
    ELSE 'low'
  END AS delta_confidence_7d
FROM latest l
LEFT JOIN (
  SELECT tenant_id, package_instance_id, t7_at, t7_distance_seconds
  FROM t7_choice WHERE rn = 1
) t ON t.tenant_id = l.tenant_id AND t.package_instance_id = l.package_instance_id
LEFT JOIN density d ON d.tenant_id = l.tenant_id AND d.package_instance_id = l.package_instance_id;

-- 3. Drop and recreate all dependent views
DROP VIEW IF EXISTS public.v_executive_client_health CASCADE;
DROP VIEW IF EXISTS public.v_executive_watchlist_7d CASCADE;
DROP VIEW IF EXISTS public.v_compliance_score_deltas_7d CASCADE;
DROP VIEW IF EXISTS public.v_predictive_risk_deltas_7d CASCADE;

-- 4. Compliance deltas with confidence
CREATE VIEW public.v_compliance_score_deltas_7d
WITH (security_invoker = true) AS
SELECT ct.tenant_id, ct.package_instance_id,
  ct.t0_overall_score, ct.t7_overall_score,
  (ct.t0_overall_score - COALESCE(ct.t7_overall_score, ct.t0_overall_score)) AS delta_overall_score_7d,
  ct.t0_phase_completion,
  (ct.t0_phase_completion - COALESCE(ct.t7_phase_completion, ct.t0_phase_completion)) AS delta_phase_completion_7d,
  ct.t0_documentation_coverage,
  (ct.t0_documentation_coverage - COALESCE(ct.t7_documentation_coverage, ct.t0_documentation_coverage)) AS delta_docs_coverage_7d,
  ct.t0_risk_health,
  (ct.t0_risk_health - COALESCE(ct.t7_risk_health, ct.t0_risk_health)) AS delta_risk_health_7d,
  ct.t0_consult_health,
  (ct.t0_consult_health - COALESCE(ct.t7_consult_health, ct.t0_consult_health)) AS delta_consult_health_7d,
  ct.t0_days_stale, ct.t7_days_stale,
  (ct.t0_days_stale - COALESCE(ct.t7_days_stale, ct.t0_days_stale)) AS delta_days_stale_7d,
  ct.t0_calculated_at, ct.t7_calculated_at,
  -- Confidence fields
  COALESCE(cc.delta_confidence_7d, 'none') AS delta_confidence_7d,
  cc.t7_distance_seconds,
  COALESCE(cc.snapshots_last_7d, 0) AS snapshots_last_7d,
  COALESCE(cc.days_since_latest, 0) AS days_since_latest
FROM v_compliance_score_t0_t7 ct
LEFT JOIN v_compliance_delta_confidence_7d cc
  ON cc.tenant_id = ct.tenant_id AND cc.package_instance_id = ct.package_instance_id;

-- 5. Predictive deltas with confidence
CREATE VIEW public.v_predictive_risk_deltas_7d
WITH (security_invoker = true) AS
SELECT pt.tenant_id, pt.package_instance_id,
  pt.t0_operational_risk_score, pt.t7_operational_risk_score,
  (pt.t0_operational_risk_score - COALESCE(pt.t7_operational_risk_score, pt.t0_operational_risk_score)) AS delta_operational_risk_7d,
  pt.t0_risk_band, pt.t7_risk_band,
  CASE WHEN pt.t7_risk_band IS NULL THEN 'no_baseline'
       WHEN pt.t0_risk_band = pt.t7_risk_band THEN 'no_change'
       ELSE 'changed' END AS risk_band_change_7d,
  pt.t0_calculated_at, pt.t7_calculated_at,
  -- Confidence fields
  COALESCE(pc.delta_confidence_7d, 'none') AS delta_confidence_7d,
  pc.t7_distance_seconds,
  COALESCE(pc.snapshots_last_7d, 0) AS snapshots_last_7d,
  COALESCE(pc.days_since_latest, 0) AS days_since_latest
FROM v_predictive_risk_t0_t7 pt
LEFT JOIN v_predictive_delta_confidence_7d pc
  ON pc.tenant_id = pt.tenant_id AND pc.package_instance_id = pt.package_instance_id;

-- 6. Watchlist
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

-- 7. Executive view with confidence fields
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
  -- 7-day deltas
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
  -- Confidence fields
  COALESCE(cd.delta_confidence_7d, 'none') AS delta_confidence_compliance_7d,
  cd.t7_distance_seconds AS t7_distance_seconds_compliance,
  COALESCE(cd.snapshots_last_7d, 0) AS snapshots_last_7d_compliance,
  COALESCE(cd.days_since_latest, 0) AS days_since_latest_compliance,
  COALESCE(rd.delta_confidence_7d, 'none') AS delta_confidence_predictive_7d,
  rd.t7_distance_seconds AS t7_distance_seconds_predictive,
  COALESCE(rd.snapshots_last_7d, 0) AS snapshots_last_7d_predictive,
  COALESCE(rd.days_since_latest, 0) AS days_since_latest_predictive,
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
