
-- Drop all dependent views in correct order
DROP VIEW IF EXISTS public.v_exec_alignment_signals_7d;
DROP VIEW IF EXISTS public.v_executive_watchlist_7d;
DROP VIEW IF EXISTS public.v_executive_consultant_distribution;
DROP VIEW IF EXISTS public.v_executive_client_health;

-- Recreate v_executive_client_health with t.status = 'active'
CREATE OR REPLACE VIEW public.v_executive_client_health AS
SELECT pi.tenant_id,
    pi.id AS package_instance_id,
    pi.package_id,
    t.name AS client_name,
    p.name AS package_name,
    p.package_type,
    pi.manager_id AS owner_user_uuid,
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
    (COALESCE(rs.active_critical, 0::bigint) > 0) AS has_active_critical,
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
     JOIN tenants t ON (t.id = pi.tenant_id)
     JOIN packages p ON (p.id = pi.package_id)
     LEFT JOIN v_compliance_score_latest cs ON (cs.tenant_id = pi.tenant_id AND cs.package_instance_id = pi.id)
     LEFT JOIN v_predictive_operational_risk_latest pr ON (pr.tenant_id = pi.tenant_id AND pr.package_instance_id = pi.id)
     LEFT JOIN v_phase_actions_remaining ar ON (ar.tenant_id = pi.tenant_id AND ar.package_instance_id = pi.id)
     LEFT JOIN v_documents_pending dp ON (dp.tenant_id = pi.tenant_id AND dp.package_instance_id = pi.id)
     LEFT JOIN v_client_risk_summary rs ON (rs.tenant_id = pi.tenant_id)
     LEFT JOIN v_consult_hours_remaining chr ON (chr.tenant_id = pi.tenant_id AND chr.package_instance_id = pi.id)
     LEFT JOIN v_compliance_score_deltas_7d cd ON (cd.tenant_id = pi.tenant_id AND cd.package_instance_id = pi.id)
     LEFT JOIN v_predictive_risk_deltas_7d rd ON (rd.tenant_id = pi.tenant_id AND rd.package_instance_id = pi.id)
     LEFT JOIN v_compliance_sparkline_30d csp ON (csp.tenant_id = pi.tenant_id AND csp.package_instance_id = pi.id)
     LEFT JOIN v_predictive_sparkline_30d psp ON (psp.tenant_id = pi.tenant_id AND psp.package_instance_id = pi.id)
  WHERE pi.is_complete = false
    AND t.status = 'active';

-- Recreate v_executive_consultant_distribution
CREATE OR REPLACE VIEW public.v_executive_consultant_distribution AS
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

-- Recreate v_executive_watchlist_7d
CREATE OR REPLACE VIEW public.v_executive_watchlist_7d AS
SELECT cd.tenant_id,
    cd.package_instance_id,
    'compliance_drop'::text AS change_type,
    cd.delta_overall_score_7d AS change_value,
    cd.t7_overall_score AS baseline_value,
    cd.t0_overall_score AS current_value
FROM v_compliance_score_deltas_7d cd
WHERE cd.delta_overall_score_7d <= -10
UNION ALL
SELECT rd.tenant_id,
    rd.package_instance_id,
    'risk_band_worsened'::text AS change_type,
    rd.delta_operational_risk_7d AS change_value,
    rd.t7_operational_risk_score AS baseline_value,
    rd.t0_operational_risk_score AS current_value
FROM v_predictive_risk_deltas_7d rd
WHERE rd.risk_band_change_7d = 'changed' AND (
    (rd.t0_risk_band = 'immediate_attention' AND rd.t7_risk_band = ANY (ARRAY['at_risk','watch','stable']))
    OR (rd.t0_risk_band = 'at_risk' AND rd.t7_risk_band = ANY (ARRAY['watch','stable']))
    OR (rd.t0_risk_band = 'watch' AND rd.t7_risk_band = 'stable'))
UNION ALL
SELECT rd.tenant_id,
    rd.package_instance_id,
    'predictive_spike'::text AS change_type,
    rd.delta_operational_risk_7d AS change_value,
    rd.t7_operational_risk_score AS baseline_value,
    rd.t0_operational_risk_score AS current_value
FROM v_predictive_risk_deltas_7d rd
WHERE rd.delta_operational_risk_7d >= 15
UNION ALL
SELECT cd.tenant_id,
    cd.package_instance_id,
    'newly_stale'::text AS change_type,
    cd.t0_days_stale AS change_value,
    COALESCE(cd.t7_days_stale, 0) AS baseline_value,
    cd.t0_days_stale AS current_value
FROM v_compliance_score_deltas_7d cd
WHERE COALESCE(cd.t7_days_stale, 0) <= 14 AND cd.t0_days_stale > 14;

-- Recreate v_exec_alignment_signals_7d
CREATE OR REPLACE VIEW public.v_exec_alignment_signals_7d AS
WITH params AS (
    SELECT (now() - '7 days'::interval) AS from_7d, now() AS to_now
), critical_risks AS (
    SELECT 'critical_risk_created'::text AS signal_type,
        'critical'::text AS severity,
        'New critical risk created'::text AS title,
        COALESCE(ei.title, ei.description, '') AS detail,
        ei.tenant_id,
        NULL::bigint AS package_instance_id,
        ei.assigned_to AS owner_user_uuid,
        ei.created_at AS happened_at,
        ('critical_risk:' || ei.id::text) AS source_key,
        1 AS priority_rank,
        'Discuss risk response and owner.'::text AS suggested_discussion
    FROM eos_issues ei, params p
    WHERE lower(COALESCE(ei.impact, '')) = 'critical' AND ei.created_at >= p.from_7d AND ei.deleted_at IS NULL
), stalled_packages AS (
    SELECT 'stalled'::text AS signal_type,
        'warning'::text AS severity,
        'Stalled > 14 days'::text AS title,
        ('Last activity: ' || to_char(sp.max_updated, 'DD Mon YYYY')) AS detail,
        sp.tenant_id,
        NULL::bigint AS package_instance_id,
        sp.assigned_csc_user_id AS owner_user_uuid,
        sp.max_updated AS happened_at,
        ('stalled:' || sp.package_id::text) AS source_key,
        2 AS priority_rank,
        'Discuss unblock plan and next action.'::text AS suggested_discussion
    FROM (SELECT cp.id AS package_id, cp.tenant_id, cp.assigned_csc_user_id, max(cpss.updated_at) AS max_updated
          FROM client_packages cp
          JOIN client_package_stage_state cpss ON cpss.package_id = cp.package_id AND cpss.tenant_id = cp.tenant_id
          WHERE COALESCE(cp.status, '') <> ALL (ARRAY['archived','completed'])
          GROUP BY cp.id, cp.tenant_id, cp.assigned_csc_user_id
          HAVING max(cpss.updated_at) <= (now() - '14 days'::interval)) sp
), phase_completed AS (
    SELECT 'phase_completed'::text AS signal_type,
        'info'::text AS severity,
        'Phase completed'::text AS title,
        ''::text AS detail,
        cpss.tenant_id,
        NULL::bigint AS package_instance_id,
        sal.changed_by AS owner_user_uuid,
        sal.changed_at AS happened_at,
        ('phase:' || sal.id::text) AS source_key,
        5 AS priority_rank,
        'Confirm next phase and timing.'::text AS suggested_discussion
    FROM stage_state_audit_log sal
    JOIN client_package_stage_state cpss ON cpss.id = sal.stage_state_id
    CROSS JOIN params p
    WHERE lower(sal.new_status) = 'completed' AND sal.changed_at >= p.from_7d
), consult_spike AS (
    SELECT 'consult_spike'::text AS signal_type,
        'info'::text AS severity,
        'High consult hours this week'::text AS title,
        (round(sum(cl.hours), 1)::text || 'h total') AS detail,
        cleg.tenant_id,
        NULL::bigint AS package_instance_id,
        NULL::uuid AS owner_user_uuid,
        max(cl.created_at) AS happened_at,
        ('consult_spike:' || cleg.tenant_id::text) AS source_key,
        4 AS priority_rank,
        'Discuss resourcing and scope pressure.'::text AS suggested_discussion
    FROM consult_logs cl
    JOIN clients_legacy cleg ON cleg.id = cl.client_id
    CROSS JOIN params p
    WHERE cl.created_at >= p.from_7d
    GROUP BY cleg.tenant_id
    HAVING sum(cl.hours) >= 8::numeric
), anomaly_signals AS (
    SELECT 'anomaly'::text AS signal_type,
        COALESCE(a.severity, 'warning') AS severity,
        a.anomaly_type AS title,
        ('Delta: ' || COALESCE(a.delta_value::text, '0')) AS detail,
        a.tenant_id,
        a.package_instance_id,
        NULL::uuid AS owner_user_uuid,
        a.detected_at::timestamptz AS happened_at,
        ('anomaly:' || a.tenant_id::text || ':' || COALESCE(a.package_instance_id::text, '0') || ':' || a.anomaly_type) AS source_key,
        3 AS priority_rank,
        'Discuss cause and corrective action.'::text AS suggested_discussion
    FROM v_executive_anomalies_30d a, params p
    WHERE a.detected_at >= p.from_7d::date
), watchlist_signals AS (
    SELECT 'watchlist'::text AS signal_type,
        'warning'::text AS severity,
        w.change_type AS title,
        ('Value: ' || COALESCE(w.change_value::text, '')) AS detail,
        w.tenant_id,
        w.package_instance_id,
        NULL::uuid AS owner_user_uuid,
        now() AS happened_at,
        ('watchlist:' || w.tenant_id::text || ':' || COALESCE(w.package_instance_id::text, '0') || ':' || w.change_type) AS source_key,
        3 AS priority_rank,
        'Discuss movement and next step.'::text AS suggested_discussion
    FROM v_executive_watchlist_7d w
), all_signals AS (
    SELECT * FROM critical_risks
    UNION ALL SELECT * FROM stalled_packages
    UNION ALL SELECT * FROM phase_completed
    UNION ALL SELECT * FROM consult_spike
    UNION ALL SELECT * FROM anomaly_signals
    UNION ALL SELECT * FROM watchlist_signals
), deduped AS (
    SELECT DISTINCT ON (source_key) *
    FROM all_signals
    ORDER BY source_key, happened_at DESC
), with_owner AS (
    SELECT d.*,
        COALESCE(d.owner_user_uuid, fallback_owner.assigned_csc_user_id) AS resolved_owner_uuid
    FROM deduped d
    LEFT JOIN LATERAL (
        SELECT cp2.assigned_csc_user_id
        FROM client_packages cp2
        WHERE cp2.tenant_id = d.tenant_id AND cp2.assigned_csc_user_id IS NOT NULL
          AND COALESCE(cp2.status, '') <> ALL (ARRAY['archived','completed'])
        ORDER BY cp2.created_at DESC
        LIMIT 1
    ) fallback_owner ON d.owner_user_uuid IS NULL
)
SELECT wo.signal_type,
    wo.severity,
    wo.title,
    wo.detail,
    wo.tenant_id,
    wo.package_instance_id,
    wo.resolved_owner_uuid AS owner_user_uuid,
    (u.first_name || ' ' || u.last_name) AS owner_name,
    t.name AS client_name,
    wo.happened_at,
    wo.source_key,
    wo.priority_rank,
    wo.suggested_discussion,
    ('/clients/' || wo.tenant_id::text) AS deep_link_href
FROM with_owner wo
LEFT JOIN users u ON u.user_uuid = wo.resolved_owner_uuid
LEFT JOIN tenants t ON t.id = wo.tenant_id
ORDER BY wo.priority_rank, wo.happened_at DESC;
