
-- ============================================================
-- Anomaly Detection Views (30-day, using existing daily MVs)
-- ============================================================

-- 1. Compliance anomaly detection
CREATE OR REPLACE VIEW public.v_compliance_anomalies_30d
WITH (security_invoker = true) AS
WITH ordered AS (
  SELECT
    tenant_id, package_instance_id, day_date,
    overall_score, risk_health, documentation_coverage, consult_health,
    row_number() OVER (PARTITION BY tenant_id, package_instance_id ORDER BY day_date DESC) AS rn
  FROM mv_compliance_score_daily_30d
),
latest AS (SELECT * FROM ordered WHERE rn = 1),
day3 AS (SELECT * FROM ordered WHERE rn > 1 AND rn <= 4 ORDER BY rn ASC LIMIT 1),
day7 AS (SELECT * FROM ordered WHERE rn > 1 AND rn <= 8 ORDER BY rn ASC LIMIT 1),
density AS (
  SELECT tenant_id, package_instance_id, count(*) AS point_count
  FROM mv_compliance_score_daily_30d
  GROUP BY tenant_id, package_instance_id
),
-- Sudden drop (score down >=15 in ~3 days)
sudden_drop AS (
  SELECT l.tenant_id, l.package_instance_id,
    'sudden_compliance_drop'::text AS anomaly_type,
    'critical'::text AS severity,
    3 AS window_days,
    d.overall_score AS baseline_value,
    l.overall_score AS current_value,
    (l.overall_score - d.overall_score) AS delta_value,
    l.day_date AS detected_at
  FROM latest l
  JOIN (SELECT o.* FROM ordered o WHERE o.rn = (SELECT MIN(o2.rn) FROM ordered o2 WHERE o2.tenant_id = o.tenant_id AND o2.package_instance_id = o.package_instance_id AND o2.rn >= 2 AND o2.rn <= 4)) d
    ON d.tenant_id = l.tenant_id AND d.package_instance_id = l.package_instance_id
  WHERE (l.overall_score - d.overall_score) <= -15
),
-- Sudden rise (score up >=15 in ~3 days)
sudden_rise AS (
  SELECT l.tenant_id, l.package_instance_id,
    'sudden_compliance_rise'::text AS anomaly_type,
    'info'::text AS severity,
    3 AS window_days,
    d.overall_score AS baseline_value,
    l.overall_score AS current_value,
    (l.overall_score - d.overall_score) AS delta_value,
    l.day_date AS detected_at
  FROM latest l
  JOIN (SELECT o.* FROM ordered o WHERE o.rn = (SELECT MIN(o2.rn) FROM ordered o2 WHERE o2.tenant_id = o.tenant_id AND o2.package_instance_id = o.package_instance_id AND o2.rn >= 2 AND o2.rn <= 4)) d
    ON d.tenant_id = l.tenant_id AND d.package_instance_id = l.package_instance_id
  WHERE (l.overall_score - d.overall_score) >= 15
),
-- Risk shock (risk_health down >=20 in 3 days)
risk_shock AS (
  SELECT l.tenant_id, l.package_instance_id,
    'risk_health_shock'::text AS anomaly_type,
    'critical'::text AS severity,
    3 AS window_days,
    d.risk_health AS baseline_value,
    l.risk_health AS current_value,
    (l.risk_health - d.risk_health) AS delta_value,
    l.day_date AS detected_at
  FROM latest l
  JOIN (SELECT o.* FROM ordered o WHERE o.rn = (SELECT MIN(o2.rn) FROM ordered o2 WHERE o2.tenant_id = o.tenant_id AND o2.package_instance_id = o.package_instance_id AND o2.rn >= 2 AND o2.rn <= 4)) d
    ON d.tenant_id = l.tenant_id AND d.package_instance_id = l.package_instance_id
  WHERE (l.risk_health - d.risk_health) <= -20
),
-- Docs shock (documentation_coverage down >=10 in 3 days)
docs_shock AS (
  SELECT l.tenant_id, l.package_instance_id,
    'docs_coverage_shock'::text AS anomaly_type,
    'warning'::text AS severity,
    3 AS window_days,
    d.documentation_coverage AS baseline_value,
    l.documentation_coverage AS current_value,
    (l.documentation_coverage - d.documentation_coverage) AS delta_value,
    l.day_date AS detected_at
  FROM latest l
  JOIN (SELECT o.* FROM ordered o WHERE o.rn = (SELECT MIN(o2.rn) FROM ordered o2 WHERE o2.tenant_id = o.tenant_id AND o2.package_instance_id = o.package_instance_id AND o2.rn >= 2 AND o2.rn <= 4)) d
    ON d.tenant_id = l.tenant_id AND d.package_instance_id = l.package_instance_id
  WHERE (l.documentation_coverage - d.documentation_coverage) <= -10
),
-- Consult shock (consult_health down >=20 in 7 days)
consult_shock AS (
  SELECT l.tenant_id, l.package_instance_id,
    'consult_health_shock'::text AS anomaly_type,
    'warning'::text AS severity,
    7 AS window_days,
    d.consult_health AS baseline_value,
    l.consult_health AS current_value,
    (l.consult_health - d.consult_health) AS delta_value,
    l.day_date AS detected_at
  FROM latest l
  JOIN (SELECT o.* FROM ordered o WHERE o.rn = (SELECT MIN(o2.rn) FROM ordered o2 WHERE o2.tenant_id = o.tenant_id AND o2.package_instance_id = o.package_instance_id AND o2.rn >= 2 AND o2.rn <= 8)) d
    ON d.tenant_id = l.tenant_id AND d.package_instance_id = l.package_instance_id
  WHERE (l.consult_health - d.consult_health) <= -20
),
-- Snapshot gap (<3 data points in 30 days)
snapshot_gap AS (
  SELECT dn.tenant_id, dn.package_instance_id,
    'snapshot_gap'::text AS anomaly_type,
    'warning'::text AS severity,
    30 AS window_days,
    dn.point_count::int AS baseline_value,
    dn.point_count::int AS current_value,
    0 AS delta_value,
    now()::date AS detected_at
  FROM density dn
  WHERE dn.point_count < 3
)
SELECT * FROM sudden_drop
UNION ALL SELECT * FROM sudden_rise
UNION ALL SELECT * FROM risk_shock
UNION ALL SELECT * FROM docs_shock
UNION ALL SELECT * FROM consult_shock
UNION ALL SELECT * FROM snapshot_gap;

-- 2. Predictive anomaly detection
CREATE OR REPLACE VIEW public.v_predictive_anomalies_30d
WITH (security_invoker = true) AS
WITH ordered AS (
  SELECT
    tenant_id, package_instance_id, day_date,
    operational_risk_score, risk_band,
    row_number() OVER (PARTITION BY tenant_id, package_instance_id ORDER BY day_date DESC) AS rn
  FROM mv_predictive_risk_daily_30d
),
latest AS (SELECT * FROM ordered WHERE rn = 1),
-- Risk spike (operational_risk_score up >=20 in 7 days)
risk_spike AS (
  SELECT l.tenant_id, l.package_instance_id,
    'predictive_risk_spike'::text AS anomaly_type,
    'critical'::text AS severity,
    7 AS window_days,
    d.operational_risk_score AS baseline_value,
    l.operational_risk_score AS current_value,
    (l.operational_risk_score - d.operational_risk_score) AS delta_value,
    l.day_date AS detected_at
  FROM latest l
  JOIN (SELECT o.* FROM ordered o WHERE o.rn = (SELECT MIN(o2.rn) FROM ordered o2 WHERE o2.tenant_id = o.tenant_id AND o2.package_instance_id = o.package_instance_id AND o2.rn >= 2 AND o2.rn <= 8)) d
    ON d.tenant_id = l.tenant_id AND d.package_instance_id = l.package_instance_id
  WHERE (l.operational_risk_score - d.operational_risk_score) >= 20
),
-- Band jump (worsens by 2+ levels in 7 days)
band_levels AS (
  SELECT *, CASE risk_band
    WHEN 'stable' THEN 0
    WHEN 'watch' THEN 1
    WHEN 'at_risk' THEN 2
    WHEN 'immediate_attention' THEN 3
    ELSE 0
  END AS band_level
  FROM ordered
),
band_jump AS (
  SELECT l.tenant_id, l.package_instance_id,
    'predictive_band_jump'::text AS anomaly_type,
    'critical'::text AS severity,
    7 AS window_days,
    d.band_level AS baseline_value,
    l.band_level AS current_value,
    (l.band_level - d.band_level) AS delta_value,
    l.day_date AS detected_at
  FROM (SELECT * FROM band_levels WHERE rn = 1) l
  JOIN (SELECT o.* FROM band_levels o WHERE o.rn = (SELECT MIN(o2.rn) FROM band_levels o2 WHERE o2.tenant_id = o.tenant_id AND o2.package_instance_id = o.package_instance_id AND o2.rn >= 2 AND o2.rn <= 8)) d
    ON d.tenant_id = l.tenant_id AND d.package_instance_id = l.package_instance_id
  WHERE (l.band_level - d.band_level) >= 2
)
SELECT * FROM risk_spike
UNION ALL SELECT * FROM band_jump;

-- 3. Unified anomalies view with ranking
CREATE OR REPLACE VIEW public.v_executive_anomalies_30d
WITH (security_invoker = true) AS
WITH all_anomalies AS (
  SELECT *, 'compliance'::text AS source FROM v_compliance_anomalies_30d
  UNION ALL
  SELECT *, 'predictive'::text AS source FROM v_predictive_anomalies_30d
)
SELECT *,
  row_number() OVER (
    ORDER BY
      CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
      abs(delta_value) DESC
  ) AS anomaly_rank
FROM all_anomalies;
