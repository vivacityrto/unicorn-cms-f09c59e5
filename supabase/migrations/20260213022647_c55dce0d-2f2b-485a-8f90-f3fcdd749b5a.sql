
-- Fix: Use tenant's assigned CSC instead of package_instance manager_id
-- for the owner_user_uuid column in v_executive_client_health

-- 1. Drop dependent view first
DROP VIEW IF EXISTS v_executive_consultant_distribution;

-- 2. Recreate v_executive_client_health with correct owner source
CREATE OR REPLACE VIEW v_executive_client_health
WITH (security_invoker = true)
AS
SELECT pi.tenant_id,
    pi.id AS package_instance_id,
    pi.package_id,
    t.name AS client_name,
    p.name AS package_name,
    p.package_type,
    t.assigned_consultant_user_id AS owner_user_uuid,
    COALESCE(cs.overall_score, 0) AS overall_score,
    COALESCE(cs.phase_completion, 0) AS phase_completion,
    COALESCE(cs.documentation_coverage, 0) AS documentation_coverage,
    COALESCE(cs.risk_health, 0) AS risk_health,
    COALESCE(cs.consult_health, 0) AS consult_health,
    COALESCE(cs.days_stale, 0) AS days_stale,
    cs.caps_applied,
    cs.calculated_at AS compliance_calculated_at,
    COALESCE(pr.operational_risk_score, 0) AS operational_risk_score,
    COALESCE(pr.risk_band, 'stable'::text) AS risk_band,
    jsonb_build_object('activity_decay', COALESCE(pr.activity_decay, false), 'severe_activity_decay', COALESCE(pr.severe_activity_decay, false), 'risk_escalation', COALESCE(pr.risk_escalation, false), 'backlog_growth', COALESCE(pr.backlog_growth, false), 'sustained_backlog_growth', COALESCE(pr.sustained_backlog_growth, false), 'burn_rate_risk', COALESCE(pr.burn_rate_risk, false), 'phase_drift', COALESCE(pr.phase_drift, false)) AS predictive_flags,
    pr.calculated_at AS predictive_calculated_at,
    COALESCE(ar.total_actions_remaining, 0) AS total_actions_remaining,
    ar.phase_name AS current_phase,
    COALESCE(dp.documents_pending_upload, 0::bigint) AS documents_pending_upload,
    COALESCE(rs.active_critical, 0::bigint) > 0 AS has_active_critical,
    COALESCE(rs.active_risks, 0::bigint) AS active_risks,
    COALESCE(chr.hours_remaining, 0::numeric) AS hours_remaining,
    COALESCE(chr.hours_included, 0) AS hours_included,
    COALESCE(cd.delta_overall_score_7d, 0) AS delta_overall_score_7d,
    COALESCE(cd.delta_phase_completion_7d, 0) AS delta_phase_completion_7d,
    COALESCE(cd.delta_docs_coverage_7d, 0) AS delta_docs_coverage_7d,
    COALESCE(cd.delta_risk_health_7d, 0) AS delta_risk_health_7d,
    COALESCE(cd.delta_consult_health_7d, 0) AS delta_consult_health_7d,
    COALESCE(cd.delta_days_stale_7d, 0) AS delta_days_stale_7d,
    COALESCE(rd.delta_operational_risk_7d, 0) AS delta_operational_risk_7d,
    COALESCE(rd.risk_band_change_7d, 'no_baseline'::text) AS risk_band_change_7d,
    cd.t7_calculated_at AS compliance_baseline_at,
    rd.t7_calculated_at AS predictive_baseline_at,
    COALESCE(cd.delta_confidence_7d, 'none'::text) AS delta_confidence_compliance_7d,
    cd.t7_distance_seconds AS t7_distance_seconds_compliance,
    COALESCE(cd.snapshots_last_7d, 0::bigint) AS snapshots_last_7d_compliance,
    COALESCE(cd.days_since_latest, 0) AS days_since_latest_compliance,
    COALESCE(rd.delta_confidence_7d, 'none'::text) AS delta_confidence_predictive_7d,
    rd.t7_distance_seconds AS t7_distance_seconds_predictive,
    COALESCE(rd.snapshots_last_7d, 0::bigint) AS snapshots_last_7d_predictive,
    COALESCE(rd.days_since_latest, 0) AS days_since_latest_predictive,
    csp.overall_scores AS compliance_spark_scores,
    csp.days AS compliance_spark_days,
    COALESCE(csp.sparkline_confidence_30d, 'none'::text) AS compliance_spark_confidence,
    psp.risk_scores AS predictive_spark_scores,
    psp.days AS predictive_spark_days,
    COALESCE(psp.sparkline_confidence_30d, 'none'::text) AS predictive_spark_confidence,
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
  WHERE pi.is_complete = false AND t.status = 'active'::text;

-- 3. Recreate dependent view: consultant distribution
CREATE OR REPLACE VIEW v_executive_consultant_distribution
WITH (security_invoker = true)
AS
SELECT u.user_uuid AS consultant_uuid,
    (u.first_name || ' ' || u.last_name) AS consultant_name,
    count(DISTINCT h.package_instance_id) AS client_count,
    count(DISTINCT h.package_instance_id) FILTER (WHERE h.risk_band = 'immediate_attention') AS immediate_count,
    count(DISTINCT h.package_instance_id) FILTER (WHERE h.risk_band = 'at_risk') AS at_risk_count,
    count(DISTINCT h.package_instance_id) FILTER (WHERE h.days_stale > 14) AS stalled_count,
    round(avg(h.overall_score)) AS avg_score,
    round(avg(h.delta_overall_score_7d)) AS avg_score_delta_7d
   FROM v_executive_client_health h
     JOIN users u ON u.user_uuid = h.owner_user_uuid
  WHERE h.owner_user_uuid IS NOT NULL
  GROUP BY u.user_uuid, u.first_name, u.last_name;
