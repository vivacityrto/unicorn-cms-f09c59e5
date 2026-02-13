
-- ============================================================
-- 30-Day Trend Sparkline Views (Materialised + Payload)
-- ============================================================

-- 1.1 Compliance 30-day daily series (materialised)
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_compliance_score_daily_30d AS
WITH s AS (
  SELECT
    tenant_id, package_instance_id,
    date_trunc('day', calculated_at) AS day,
    overall_score, phase_completion, documentation_coverage,
    risk_health, consult_health, calculated_at,
    row_number() OVER (
      PARTITION BY tenant_id, package_instance_id, date_trunc('day', calculated_at)
      ORDER BY calculated_at DESC
    ) AS rn
  FROM compliance_score_snapshots
  WHERE calculated_at >= now() - interval '30 days'
)
SELECT tenant_id, package_instance_id,
  day::date AS day_date, overall_score, phase_completion,
  documentation_coverage, risk_health, consult_health,
  calculated_at AS picked_at
FROM s WHERE rn = 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_compliance_daily_30d_uniq
  ON mv_compliance_score_daily_30d (tenant_id, package_instance_id, day_date);

-- 1.2 Predictive 30-day daily series (materialised, internal only)
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_predictive_risk_daily_30d AS
WITH s AS (
  SELECT
    tenant_id, package_instance_id,
    date_trunc('day', calculated_at) AS day,
    operational_risk_score, risk_band, calculated_at,
    row_number() OVER (
      PARTITION BY tenant_id, package_instance_id, date_trunc('day', calculated_at)
      ORDER BY calculated_at DESC
    ) AS rn
  FROM predictive_operational_risk_snapshots
  WHERE calculated_at >= now() - interval '30 days'
)
SELECT tenant_id, package_instance_id,
  day::date AS day_date, operational_risk_score, risk_band,
  calculated_at AS picked_at
FROM s WHERE rn = 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_predictive_daily_30d_uniq
  ON mv_predictive_risk_daily_30d (tenant_id, package_instance_id, day_date);

-- 2.1 Compliance sparkline payload
CREATE OR REPLACE VIEW public.v_compliance_sparkline_30d
WITH (security_invoker = true) AS
WITH a AS (
  SELECT tenant_id, package_instance_id,
    count(*) AS points_30d,
    array_agg(day_date ORDER BY day_date) AS days,
    array_agg(overall_score ORDER BY day_date) AS overall_scores
  FROM mv_compliance_score_daily_30d
  GROUP BY tenant_id, package_instance_id
)
SELECT tenant_id, package_instance_id, points_30d, days, overall_scores,
  CASE
    WHEN points_30d >= 20 THEN 'high'
    WHEN points_30d >= 10 THEN 'medium'
    WHEN points_30d >= 3 THEN 'low'
    ELSE 'none'
  END AS sparkline_confidence_30d
FROM a;

-- 2.2 Predictive sparkline payload (internal only)
CREATE OR REPLACE VIEW public.v_predictive_sparkline_30d
WITH (security_invoker = true) AS
WITH a AS (
  SELECT tenant_id, package_instance_id,
    count(*) AS points_30d,
    array_agg(day_date ORDER BY day_date) AS days,
    array_agg(operational_risk_score ORDER BY day_date) AS risk_scores
  FROM mv_predictive_risk_daily_30d
  GROUP BY tenant_id, package_instance_id
)
SELECT tenant_id, package_instance_id, points_30d, days, risk_scores,
  CASE
    WHEN points_30d >= 20 THEN 'high'
    WHEN points_30d >= 10 THEN 'medium'
    WHEN points_30d >= 3 THEN 'low'
    ELSE 'none'
  END AS sparkline_confidence_30d
FROM a;

-- 3. Refresh function (service role)
CREATE OR REPLACE FUNCTION public.refresh_exec_trend_mvs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_compliance_score_daily_30d;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_predictive_risk_daily_30d;
END;
$$;

-- 4. Update v_executive_client_health to include sparkline data
DROP VIEW IF EXISTS public.v_executive_client_health CASCADE;
DROP VIEW IF EXISTS public.v_executive_watchlist_7d CASCADE;

-- Recreate watchlist
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

-- Recreate executive view with sparkline fields
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
  -- 30-day sparkline data
  csp.overall_scores AS compliance_spark_scores,
  csp.days AS compliance_spark_days,
  COALESCE(csp.sparkline_confidence_30d, 'none') AS compliance_spark_confidence,
  psp.risk_scores AS predictive_spark_scores,
  psp.days AS predictive_spark_days,
  COALESCE(psp.sparkline_confidence_30d, 'none') AS predictive_spark_confidence,
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
LEFT JOIN v_compliance_sparkline_30d csp ON csp.tenant_id = pi.tenant_id AND csp.package_instance_id = pi.id
LEFT JOIN v_predictive_sparkline_30d psp ON psp.tenant_id = pi.tenant_id AND psp.package_instance_id = pi.id
WHERE pi.is_complete = false;
