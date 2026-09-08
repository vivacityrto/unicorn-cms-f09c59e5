-- Phase 2.6 stabilization Packet P3-A item 2 (dashboard timeout) — apply
-- the same H0.0 containment decision (2026-09-07, Client Health H0.0:
-- "show unavailable wherever the invalid stage-health metric is consumed,
-- do not relabel it as trustworthy") to the two dashboard views that
-- compute stage-health-derived fields from the raw, known-defective
-- stage_health_snapshots table. Carl explicitly authorized this after
-- root-causing L10 item #26 (Attention Ranking / Priority Inbox / Labour
-- Efficiency down in production) to this exact per-tenant DISTINCT ON
-- scan: EXPLAIN ANALYZE showed 97% of query time (1100ms of 1129ms) spent
-- scanning ~1,987 historical snapshot rows per tenant just to compute
-- worst_stage_health_status, well within reach of the 8s statement_timeout
-- under real load.
--
-- The nightly cron that generated new stage_health_snapshots rows was
-- already paused 2026-09-07 (see
-- docs/audit-log/entries/2026-09-07-pause-stage-health-monitor-cron.md);
-- this migration does not touch that table or its rows, which remain
-- retained as evidence per H0.0's own instruction. It only stops two
-- VIEWS from deriving live fields out of that frozen, defective dataset.
--
-- 1. v_dashboard_tenant_portfolio: worst_stage_health_status/
--    critical_stage_count/at_risk_stage_count previously came from a
--    LATERAL DISTINCT ON scan of stage_health_snapshots per tenant. Now a
--    fixed stub ('unavailable'/0/0) — output column names/types are
--    unchanged, so every downstream consumer (v_dashboard_attention_ranked,
--    v_dashboard_behavioural_prompts, v_dashboard_labour_efficiency, all of
--    which read this view) keeps working, just without a real stage-health
--    signal until the new client-health plan ships. attention_score's
--    stage_score sub-score correctly falls through to 0 (no contribution)
--    for an unrecognized health value, rather than silently scoring as
--    healthy.
-- 2. v_dashboard_priority_inbox: removed the "stage_health" UNION ALL
--    branch entirely (a global, un-tenant-scoped DISTINCT ON scan
--    generating "Stage health: critical/at_risk" inbox items from the
--    same defective data) — displaying alerts derived from data already
--    known to be wrong is exactly what H0.0 said not to do, and this
--    branch was also independently expensive. The other 6 UNION ALL
--    branches (risk alerts, evidence gaps, burn risk, retention risk,
--    regulator changes, playbook suggestions, overdue compliance) are
--    untouched.
--
-- Known, disclosed side effect on the frontend (no code change needed,
-- both fall through safely to their existing "no match" branches):
-- useDashboardTriage.ts's "low attention" bucket requires
-- worst_stage_health_status === 'healthy', and its "Critical stages"
-- Today's Focus auto-item requires === 'critical' — with every tenant now
-- 'unavailable', neither condition is ever true. The dashboard correctly
-- stops claiming any tenant is stage-health-healthy or stage-health-critical
-- rather than showing a false signal; the low-attention bucket empties out
-- and no stage-health Focus items generate until the new plan restores a
-- trustworthy signal.
--
-- migration-target-project: yxkgdalkbrriasiyyrwk

CREATE OR REPLACE VIEW public.v_dashboard_tenant_portfolio AS
 SELECT t.id AS tenant_id,
    t.name AS tenant_name,
    t.status AS tenant_status,
    t.lifecycle_status,
    t.access_status,
    t.abn,
    t.rto_id,
    t.cricos_id,
    t.assigned_consultant_user_id AS assigned_csc_user_id,
    '[]'::jsonb AS packages_json,
    COALESCE(t.risk_level, 'stable'::text) AS risk_status,
    COALESCE(ri.risk_index, 0) AS risk_index,
    0 AS risk_index_delta_14d,
    sh.worst_health AS worst_stage_health_status,
    sh.critical_count::integer AS critical_stage_count,
    sh.at_risk_count::integer AS at_risk_stage_count,
    COALESCE(tk.open_count, 0::bigint)::integer AS open_tasks_count,
    COALESCE(tk.overdue_count, 0::bigint)::integer AS overdue_tasks_count,
    COALESCE(eg.mandatory_gaps, 0) AS mandatory_gaps_count,
    COALESCE(cl.hours_30d, 0::numeric) AS consult_hours_30d,
    COALESCE(bf.burn_risk_status, 'normal'::text) AS burn_risk_status,
    bf.projected_exhaustion_date,
    COALESCE(rf.retention_status, 'stable'::text) AS retention_status,
    rf.composite_retention_risk_index,
    tla.last_activity_at
   FROM tenants t
     LEFT JOIN LATERAL ( SELECT
                CASE re.severity
                    WHEN 'critical'::text THEN 90
                    WHEN 'high'::text THEN 70
                    WHEN 'moderate'::text THEN 40
                    ELSE 10
                END AS risk_index
           FROM risk_events re
          WHERE re.tenant_id = t.id
          ORDER BY re.created_at DESC
         LIMIT 1) ri ON true
     -- P3-A H0.0 containment (2026-09-08): stage_health_snapshots is
     -- known-defective (see H0.0's audit entry) and the generating cron is
     -- already paused. This used to be a per-tenant DISTINCT ON scan over
     -- that table; it's now a fixed stub until the new client-health plan
     -- provides a real signal. Restore a real computation here (or point
     -- it at the new plan's replacement table/view) when that's ready.
     LEFT JOIN LATERAL ( SELECT 'unavailable'::text AS worst_health,
            0::bigint AS critical_count,
            0::bigint AS at_risk_count) sh ON true
     LEFT JOIN LATERAL ( SELECT count(*) FILTER (WHERE cai.completed_at IS NULL) AS open_count,
            count(*) FILTER (WHERE cai.completed_at IS NULL AND cai.due_date IS NOT NULL AND cai.due_date < CURRENT_DATE) AS overdue_count,
            max(cai.updated_at) AS latest_task_at
           FROM client_action_items cai
          WHERE cai.tenant_id = t.id) tk ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(jsonb_array_length(egc.missing_categories_json)), 0::bigint)::integer AS mandatory_gaps,
            max(egc.created_at) AS latest_gap_at
           FROM evidence_gap_checks egc
          WHERE egc.tenant_id = t.id AND egc.status = 'gaps_found'::text) eg ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(te.duration_minutes)::numeric / 60.0, 0::numeric) AS hours_30d
           FROM time_entries te
          WHERE te.tenant_id = t.id AND te.start_at >= (now() - '30 days'::interval) AND te.is_billable = true) cl ON true
     LEFT JOIN LATERAL ( SELECT bf2.burn_risk_status,
            bf2.projected_exhaustion_date
           FROM tenant_package_burn_forecast bf2
          WHERE bf2.tenant_id = t.id
          ORDER BY (
                CASE bf2.burn_risk_status
                    WHEN 'critical'::text THEN 1
                    WHEN 'warning'::text THEN 2
                    ELSE 3
                END)
         LIMIT 1) bf ON true
     LEFT JOIN LATERAL ( SELECT rf2.retention_status,
            rf2.composite_retention_risk_index
           FROM tenant_retention_forecasts rf2
          WHERE rf2.tenant_id = t.id
          ORDER BY rf2.forecast_date DESC
         LIMIT 1) rf ON true
     LEFT JOIN v_tenant_last_activity tla ON tla.tenant_id = t.id
  WHERE t.status = 'active'::text AND COALESCE(t.is_system_tenant, false) = false;

CREATE OR REPLACE VIEW public.v_dashboard_priority_inbox AS
 SELECT real_time_risk_alerts.id AS item_id,
    'risk_alert'::text AS item_type,
    real_time_risk_alerts.severity,
    real_time_risk_alerts.tenant_id,
    NULL::uuid AS stage_instance_id,
    NULL::text AS standard_clause,
    real_time_risk_alerts.alert_summary AS summary,
    NULL::uuid AS owner_user_id,
    real_time_risk_alerts.created_at
   FROM real_time_risk_alerts
  WHERE real_time_risk_alerts.resolved_flag = false AND real_time_risk_alerts.archived_flag = false
UNION ALL
 SELECT eg.id AS item_id,
    'evidence_gap'::text AS item_type,
    'high'::text AS severity,
    eg.tenant_id,
    NULL::uuid AS stage_instance_id,
    NULL::text AS standard_clause,
    'Mandatory evidence gaps: '::text || COALESCE(jsonb_array_length(eg.missing_categories_json), 0) AS summary,
    NULL::uuid AS owner_user_id,
    eg.created_at
   FROM evidence_gap_checks eg
  WHERE eg.status = 'gaps_found'::text
UNION ALL
 SELECT bf.id AS item_id,
    'burn_risk'::text AS item_type,
    'critical'::text AS severity,
    bf.tenant_id,
    NULL::uuid AS stage_instance_id,
    NULL::text AS standard_clause,
    'Hours exhaustion projected: '::text || COALESCE(bf.projected_exhaustion_date::text, 'unknown'::text) AS summary,
    NULL::uuid AS owner_user_id,
    bf.generated_at AS created_at
   FROM tenant_package_burn_forecast bf
  WHERE bf.burn_risk_status = 'critical'::text
UNION ALL
 SELECT rf.id AS item_id,
    'retention_risk'::text AS item_type,
        CASE
            WHEN rf.retention_status = 'high_risk'::text THEN 'critical'::text
            ELSE 'high'::text
        END AS severity,
    rf.tenant_id,
    NULL::uuid AS stage_instance_id,
    NULL::text AS standard_clause,
    'Retention risk: '::text || rf.retention_status AS summary,
    NULL::uuid AS owner_user_id,
    rf.generated_at AS created_at
   FROM tenant_retention_forecasts rf
  WHERE rf.retention_status = ANY (ARRAY['vulnerable'::text, 'high_risk'::text])
UNION ALL
 SELECT rce.id AS item_id,
    'regulator_change'::text AS item_type,
        CASE
            WHEN rce.impact_level = 'critical'::text THEN 'critical'::text
            WHEN rce.impact_level = 'high'::text THEN 'high'::text
            ELSE 'moderate'::text
        END AS severity,
    NULL::bigint AS tenant_id,
    NULL::uuid AS stage_instance_id,
    NULL::text AS standard_clause,
    'Regulator change: '::text || "left"(COALESCE(rce.change_summary_md, ''::text), 80) AS summary,
    NULL::uuid AS owner_user_id,
    rce.created_at
   FROM regulator_change_events rce
  WHERE rce.review_status = 'pending'::text
UNION ALL
 SELECT pa.id AS item_id,
    'playbook_suggested'::text AS item_type,
    'moderate'::text AS severity,
    pa.tenant_id,
    pa.stage_instance_id,
    NULL::text AS standard_clause,
    'Playbook suggested: '::text || COALESCE(pa.activation_reason, ''::text) AS summary,
    NULL::uuid AS owner_user_id,
    pa.activated_at AS created_at
   FROM playbook_activations pa
  WHERE pa.activation_status = 'suggested'::text
UNION ALL
 SELECT oc.item_id,
    oc.item_type,
    oc.severity,
    oc.tenant_id,
    oc.stage_instance_id,
    oc.standard_clause,
    oc.summary,
    oc.owner_user_id,
    oc.created_at
   FROM v_dashboard_priority_inbox_overdue_compliance oc;
