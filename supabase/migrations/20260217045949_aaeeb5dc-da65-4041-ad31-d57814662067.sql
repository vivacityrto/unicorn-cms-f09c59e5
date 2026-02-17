
-- =============================================
-- Phase 5: Update reporting views for lifecycle
-- =============================================

-- 1. Simple views first (no dependents, no column changes)
CREATE OR REPLACE VIEW public.v_exec_consult_hours_7d
WITH (security_invoker = true)
AS
WITH windows AS (
  SELECT now() - '7 days'::interval AS w0_from, now() AS w0_to,
         now() - '14 days'::interval AS w1_from, now() - '7 days'::interval AS w1_to
), base AS (
  SELECT DISTINCT cl.consult_id, cl.client_id, cl.created_at, cl.hours
  FROM consult_logs cl
)
SELECT cleg.tenant_id,
  COALESCE(sum(b.hours) FILTER (WHERE b.created_at >= w.w0_from AND b.created_at < w.w0_to), 0) AS consult_hours_logged_7d,
  COALESCE(sum(b.hours) FILTER (WHERE b.created_at >= w.w1_from AND b.created_at < w.w1_to), 0) AS consult_hours_logged_prev_7d,
  COALESCE(sum(b.hours) FILTER (WHERE b.created_at >= w.w0_from AND b.created_at < w.w0_to), 0)
  - COALESCE(sum(b.hours) FILTER (WHERE b.created_at >= w.w1_from AND b.created_at < w.w1_to), 0) AS consult_hours_logged_delta
FROM base b
JOIN clients_legacy cleg ON cleg.id = b.client_id
JOIN tenants t ON t.id = cleg.tenant_id
CROSS JOIN windows w
WHERE t.lifecycle_status NOT IN ('closed','archived')
GROUP BY cleg.tenant_id;

CREATE OR REPLACE VIEW public.v_exec_phases_completed_7d
WITH (security_invoker = true)
AS
WITH windows AS (
  SELECT now() - '7 days'::interval AS w0_from, now() AS w0_to,
         now() - '14 days'::interval AS w1_from, now() - '7 days'::interval AS w1_to
), completed AS (
  SELECT DISTINCT sal.id, sal.stage_state_id, sal.changed_at
  FROM stage_state_audit_log sal
  WHERE lower(sal.new_status) = 'completed'
)
SELECT cpss.tenant_id,
  count(*) FILTER (WHERE c.changed_at >= w.w0_from AND c.changed_at < w.w0_to) AS phases_completed_7d,
  count(*) FILTER (WHERE c.changed_at >= w.w1_from AND c.changed_at < w.w1_to) AS phases_completed_prev_7d,
  count(*) FILTER (WHERE c.changed_at >= w.w0_from AND c.changed_at < w.w0_to)
  - count(*) FILTER (WHERE c.changed_at >= w.w1_from AND c.changed_at < w.w1_to) AS phases_completed_delta
FROM completed c
JOIN client_package_stage_state cpss ON cpss.id = c.stage_state_id
JOIN tenants t ON t.id = cpss.tenant_id
CROSS JOIN windows w
WHERE t.lifecycle_status NOT IN ('closed','archived')
GROUP BY cpss.tenant_id;

CREATE OR REPLACE VIEW public.v_exec_execution_momentum_7d
WITH (security_invoker = true)
AS
WITH windows AS (
  SELECT now() - '7 days'::interval AS w0_from, now() AS w0_to,
         now() - '14 days'::interval AS w1_from, now() - '7 days'::interval AS w1_to
), risks_resolved AS (
  SELECT ei.tenant_id,
    count(*) FILTER (WHERE ei.resolved_at >= w.w0_from AND ei.resolved_at < w.w0_to) AS w0,
    count(*) FILTER (WHERE ei.resolved_at >= w.w1_from AND ei.resolved_at < w.w1_to) AS w1
  FROM eos_issues ei
  JOIN tenants t ON t.id = ei.tenant_id
  CROSS JOIN windows w
  WHERE ei.resolved_at IS NOT NULL AND t.lifecycle_status NOT IN ('closed','archived')
  GROUP BY ei.tenant_id
), documents_generated AS (
  SELECT gd.tenant_id,
    count(*) FILTER (WHERE gd.created_at >= w.w0_from AND gd.created_at < w.w0_to) AS w0,
    count(*) FILTER (WHERE gd.created_at >= w.w1_from AND gd.created_at < w.w1_to) AS w1
  FROM generated_documents gd
  JOIN tenants t ON t.id = gd.tenant_id
  CROSS JOIN windows w
  WHERE t.lifecycle_status NOT IN ('closed','archived')
  GROUP BY gd.tenant_id
), document_events AS (
  SELECT dal.tenant_id,
    count(*) FILTER (WHERE dal.occurred_at >= w.w0_from AND dal.occurred_at < w.w0_to) AS w0,
    count(*) FILTER (WHERE dal.occurred_at >= w.w1_from AND dal.occurred_at < w.w1_to) AS w1
  FROM document_activity_log dal
  JOIN tenants t ON t.id = dal.tenant_id
  CROSS JOIN windows w
  WHERE t.lifecycle_status NOT IN ('closed','archived')
  GROUP BY dal.tenant_id
), tenants_union AS (
  SELECT tenant_id FROM risks_resolved UNION
  SELECT tenant_id FROM documents_generated UNION
  SELECT tenant_id FROM document_events UNION
  SELECT tenant_id FROM v_exec_consult_hours_7d UNION
  SELECT tenant_id FROM v_exec_phases_completed_7d
)
SELECT tu.tenant_id,
  COALESCE(rr.w0, 0) AS risks_resolved_7d, COALESCE(rr.w1, 0) AS risks_resolved_prev_7d,
  COALESCE(rr.w0, 0) - COALESCE(rr.w1, 0) AS risks_resolved_delta,
  COALESCE(dg.w0, 0) AS documents_generated_7d, COALESCE(dg.w1, 0) AS documents_generated_prev_7d,
  COALESCE(dg.w0, 0) - COALESCE(dg.w1, 0) AS documents_generated_delta,
  COALESCE(de.w0, 0) AS document_events_7d, COALESCE(de.w1, 0) AS document_events_prev_7d,
  COALESCE(de.w0, 0) - COALESCE(de.w1, 0) AS document_events_delta,
  COALESCE(pc.phases_completed_7d, 0) AS phases_completed_7d,
  COALESCE(pc.phases_completed_prev_7d, 0) AS phases_completed_prev_7d,
  COALESCE(pc.phases_completed_delta, 0) AS phases_completed_delta,
  COALESCE(ch.consult_hours_logged_7d, 0) AS consult_hours_logged_7d,
  COALESCE(ch.consult_hours_logged_prev_7d, 0) AS consult_hours_logged_prev_7d,
  COALESCE(ch.consult_hours_logged_delta, 0) AS consult_hours_logged_delta
FROM tenants_union tu
LEFT JOIN risks_resolved rr ON rr.tenant_id = tu.tenant_id
LEFT JOIN documents_generated dg ON dg.tenant_id = tu.tenant_id
LEFT JOIN document_events de ON de.tenant_id = tu.tenant_id
LEFT JOIN v_exec_phases_completed_7d pc ON pc.tenant_id = tu.tenant_id
LEFT JOIN v_exec_consult_hours_7d ch ON ch.tenant_id = tu.tenant_id;

CREATE OR REPLACE VIEW public.v_exec_system_health
WITH (security_invoker = true)
AS
SELECT cpss_tenants.tenant_id,
  count(DISTINCT cpss_tenants.tenant_id) AS active_clients,
  count(DISTINCT cs_match.tenant_id) AS clients_with_compliance_snapshot,
  round(100.0 * count(DISTINCT cs_match.tenant_id)::numeric / NULLIF(count(DISTINCT cpss_tenants.tenant_id), 0)::numeric, 1) AS compliance_coverage_pct,
  max(cs_match.calculated_at) AS latest_compliance_snapshot_at
FROM (
  SELECT DISTINCT cpss.tenant_id
  FROM client_package_stage_state cpss
  JOIN tenants t ON t.id = cpss.tenant_id
  WHERE t.lifecycle_status NOT IN ('closed','archived')
) cpss_tenants
LEFT JOIN v_compliance_score_latest cs_match ON cs_match.tenant_id = cpss_tenants.tenant_id
GROUP BY cpss_tenants.tenant_id;

-- 2. Drop dependent views (CASCADE from portfolio & last_activity)
DROP VIEW IF EXISTS public.v_dashboard_attention_ranked CASCADE;
DROP VIEW IF EXISTS public.v_dashboard_behavioural_prompts CASCADE;
DROP VIEW IF EXISTS public.v_dashboard_labour_efficiency CASCADE;
DROP VIEW IF EXISTS public.v_tenant_activity_summary CASCADE;
DROP VIEW IF EXISTS public.v_dashboard_tenant_portfolio CASCADE;
DROP VIEW IF EXISTS public.v_tenant_last_activity CASCADE;
DROP VIEW IF EXISTS public.v_client_engagement_summary CASCADE;

-- 3. Recreate v_tenant_last_activity with lifecycle_status
CREATE VIEW public.v_tenant_last_activity
WITH (security_invoker = true)
AS
SELECT t.id AS tenant_id,
  t.lifecycle_status,
  GREATEST(
    COALESCE((SELECT max(di.updated_at) FROM document_instances di WHERE di.tenant_id = t.id), '1970-01-01'::timestamptz),
    COALESCE((SELECT max(n.updated_at) FROM notes n WHERE n.tenant_id = t.id), '1970-01-01'::timestamptz),
    COALESCE((SELECT max(m.updated_at) FROM meetings m WHERE m.tenant_id = t.id), '1970-01-01'::timestamptz),
    COALESCE((SELECT max(em.created_at) FROM email_messages em WHERE em.tenant_id = t.id), '1970-01-01'::timestamptz),
    COALESCE((SELECT max(cl.created_at) FROM consult_logs cl WHERE cl.tenant_id = t.id)::timestamptz, '1970-01-01'::timestamptz),
    COALESCE(t.created_at, '1970-01-01'::timestamptz)
  ) AS last_activity_at
FROM tenants t;

-- 4. Recreate v_tenant_activity_summary
CREATE VIEW public.v_tenant_activity_summary
WITH (security_invoker = true)
AS
SELECT count(*) AS tenants,
  min(v_tenant_last_activity.last_activity_at) AS oldest_activity_at,
  max(v_tenant_last_activity.last_activity_at) AS newest_activity_at,
  percentile_disc(0.5) WITHIN GROUP (ORDER BY v_tenant_last_activity.last_activity_at) AS median_activity_at
FROM v_tenant_last_activity;

-- 5. Recreate v_client_engagement_summary with lifecycle columns
CREATE VIEW public.v_client_engagement_summary
WITH (security_invoker = true)
AS
SELECT t.id AS tenant_id,
  t.name AS client_name,
  t.status AS client_status,
  t.lifecycle_status,
  t.access_status,
  t.rto_id,
  t.created_at AS client_since,
  (SELECT count(*) FROM package_instances pi WHERE pi.tenant_id = t.id) AS total_packages,
  (SELECT count(*) FROM package_instances pi WHERE pi.tenant_id = t.id AND pi.is_complete = false) AS active_packages,
  (SELECT count(*) FROM eos_meetings em WHERE em.tenant_id = t.id) AS total_meetings,
  (SELECT count(*) FROM eos_rocks er WHERE er.tenant_id = t.id) AS total_rocks,
  (SELECT count(*) FROM eos_issues ei WHERE ei.tenant_id = t.id AND ei.deleted_at IS NULL) AS total_issues
FROM tenants t;

-- 6. Recreate v_dashboard_tenant_portfolio with lifecycle columns
CREATE VIEW public.v_dashboard_tenant_portfolio
WITH (security_invoker = true)
AS
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
  COALESCE(t.risk_level, 'stable') AS risk_status,
  COALESCE(ri.risk_index, 0) AS risk_index,
  0 AS risk_index_delta_14d,
  COALESCE(sh.worst_health, 'healthy') AS worst_stage_health_status,
  COALESCE(sh.critical_count, 0)::integer AS critical_stage_count,
  COALESCE(sh.at_risk_count, 0)::integer AS at_risk_stage_count,
  COALESCE(tk.open_count, 0)::integer AS open_tasks_count,
  COALESCE(tk.overdue_count, 0)::integer AS overdue_tasks_count,
  COALESCE(eg.mandatory_gaps, 0) AS mandatory_gaps_count,
  COALESCE(cl.hours_30d, 0) AS consult_hours_30d,
  COALESCE(bf.burn_risk_status, 'normal') AS burn_risk_status,
  bf.projected_exhaustion_date,
  COALESCE(rf.retention_status, 'stable') AS retention_status,
  rf.composite_retention_risk_index,
  GREATEST(tk.latest_task_at, cl.latest_consult_at::timestamptz, eg.latest_gap_at) AS last_activity_at
FROM tenants t
LEFT JOIN LATERAL (
  SELECT CASE re.severity WHEN 'critical' THEN 90 WHEN 'high' THEN 70 WHEN 'moderate' THEN 40 ELSE 10 END AS risk_index
  FROM risk_events re WHERE re.tenant_id = t.id ORDER BY re.created_at DESC LIMIT 1
) ri ON true
LEFT JOIN LATERAL (
  SELECT
    CASE min(CASE sub.hs WHEN 'critical' THEN 1 WHEN 'at_risk' THEN 2 WHEN 'monitoring' THEN 3 ELSE 4 END)
      WHEN 1 THEN 'critical' WHEN 2 THEN 'at_risk' WHEN 3 THEN 'monitoring' ELSE 'healthy' END AS worst_health,
    count(*) FILTER (WHERE sub.hs = 'critical') AS critical_count,
    count(*) FILTER (WHERE sub.hs = 'at_risk') AS at_risk_count
  FROM (SELECT DISTINCT ON (shs.stage_instance_id) shs.health_status AS hs
        FROM stage_health_snapshots shs WHERE shs.tenant_id = t.id
        ORDER BY shs.stage_instance_id, shs.generated_at DESC) sub
) sh ON true
LEFT JOIN LATERAL (
  SELECT count(*) FILTER (WHERE tt.completed = false) AS open_count,
    count(*) FILTER (WHERE tt.completed = false AND tt.due_date < now()) AS overdue_count,
    max(tt.updated_at) AS latest_task_at
  FROM tasks_tenants tt WHERE tt.tenant_id = t.id
) tk ON true
LEFT JOIN LATERAL (
  SELECT COALESCE(sum(jsonb_array_length(egc.missing_categories_json)), 0)::integer AS mandatory_gaps,
    max(egc.created_at) AS latest_gap_at
  FROM evidence_gap_checks egc WHERE egc.tenant_id = t.id AND egc.status = 'gaps_found'
) eg ON true
LEFT JOIN LATERAL (
  SELECT COALESCE(sum(c.hours), 0) AS hours_30d, max(c.date) AS latest_consult_at
  FROM consult_logs c WHERE c.client_id = t.id_uuid AND c.date >= (now() - '30 days'::interval)::date
) cl ON true
LEFT JOIN LATERAL (
  SELECT bf2.burn_risk_status, bf2.projected_exhaustion_date
  FROM tenant_package_burn_forecast bf2 WHERE bf2.tenant_id = t.id
  ORDER BY CASE bf2.burn_risk_status WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END LIMIT 1
) bf ON true
LEFT JOIN LATERAL (
  SELECT rf2.retention_status, rf2.composite_retention_risk_index
  FROM tenant_retention_forecasts rf2 WHERE rf2.tenant_id = t.id ORDER BY rf2.forecast_date DESC LIMIT 1
) rf ON true
WHERE t.lifecycle_status IN ('active','suspended')
  AND COALESCE(t.is_system_tenant, false) = false;

-- 7. Recreate v_dashboard_attention_ranked (unchanged logic, just depends on portfolio)
CREATE VIEW public.v_dashboard_attention_ranked
WITH (security_invoker = true)
AS
WITH base AS (
  SELECT p.tenant_id, p.tenant_name, p.tenant_status, p.abn, p.rto_id, p.cricos_id,
    p.assigned_csc_user_id, p.packages_json, p.risk_status, p.risk_index, p.risk_index_delta_14d,
    p.worst_stage_health_status, p.critical_stage_count, p.at_risk_stage_count,
    p.open_tasks_count, p.overdue_tasks_count, p.mandatory_gaps_count, p.consult_hours_30d,
    p.burn_risk_status, p.projected_exhaustion_date, p.retention_status,
    p.composite_retention_risk_index, p.last_activity_at,
    tcp.renewal_window_start,
    COALESCE(hsr.high_severity_open_risks, 0) AS high_severity_open_risks,
    COALESCE(EXTRACT(epoch FROM now() - p.last_activity_at) / 86400, 999)::integer AS days_since_activity,
    CASE WHEN tcp.renewal_window_start IS NOT NULL THEN tcp.renewal_window_start - CURRENT_DATE ELSE NULL END AS days_to_renewal,
    COALESCE(tm.overdue_tasks, 0)::integer AS compliance_overdue_tasks,
    COALESCE(tm.blocked_tasks, 0)::integer AS compliance_blocked_tasks,
    COALESCE(tm.open_tasks, 0)::integer AS compliance_open_tasks
  FROM v_dashboard_tenant_portfolio p
  LEFT JOIN tenant_commercial_profiles tcp ON tcp.tenant_id = p.tenant_id
  LEFT JOIN LATERAL (SELECT count(*)::integer AS high_severity_open_risks FROM risk_events re
    WHERE re.tenant_id = p.tenant_id AND re.severity = 'high' AND re.status = 'open') hsr ON true
  LEFT JOIN v_tenant_compliance_task_metrics tm ON tm.tenant_id = p.tenant_id
), sub_scores AS (
  SELECT b.*,
    LEAST(100, GREATEST(0,
      CASE b.worst_stage_health_status WHEN 'critical' THEN 100 WHEN 'at_risk' THEN 70 WHEN 'monitoring' THEN 35 ELSE 0 END
      + LEAST(b.critical_stage_count * 10, 20) + LEAST(b.at_risk_stage_count * 5, 15))) AS stage_score,
    CASE WHEN b.mandatory_gaps_count = 0 THEN 0 ELSE LEAST(100, b.mandatory_gaps_count * 20) END AS gaps_score,
    LEAST(100::numeric, GREATEST(0::numeric, COALESCE(b.risk_index, 0)::numeric
      + LEAST(25::numeric, GREATEST(0::numeric, COALESCE(b.risk_index_delta_14d, 0)::numeric * 1.5))
      + LEAST(25, b.high_severity_open_risks * 10)::numeric))::integer AS risk_score,
    LEAST(100, b.compliance_overdue_tasks * 25 + b.compliance_blocked_tasks * 15 + b.compliance_open_tasks * 3) AS task_score,
    LEAST(100,
      CASE WHEN b.days_since_activity <= 7 THEN 0 WHEN b.days_since_activity <= 14 THEN 25
           WHEN b.days_since_activity <= 21 THEN 50 WHEN b.days_since_activity <= 30 THEN 75 ELSE 100 END
      + CASE WHEN b.open_tasks_count > 0 AND b.days_since_activity >= 15 THEN 10 ELSE 0 END) AS staleness_score,
    CASE WHEN b.days_to_renewal IS NULL THEN 0 WHEN b.days_to_renewal <= 14 THEN 100
         WHEN b.days_to_renewal <= 30 THEN 75 WHEN b.days_to_renewal <= 60 THEN 50
         WHEN b.days_to_renewal <= 90 THEN 25 ELSE 0 END AS renewal_score,
    LEAST(100,
      CASE b.burn_risk_status WHEN 'critical' THEN 100 WHEN 'accelerated' THEN 50 ELSE 0 END
      + CASE WHEN b.projected_exhaustion_date IS NOT NULL AND (b.projected_exhaustion_date - CURRENT_DATE) <= 30 THEN 15 ELSE 0 END) AS burn_score
  FROM base b
), final AS (
  SELECT s.*,
    calculate_attention_score(s.stage_score, s.gaps_score, s.risk_score, s.staleness_score, s.task_score, s.renewal_score, s.burn_score, s.compliance_overdue_tasks) AS attention_score,
    (SELECT jsonb_agg(sub.d ORDER BY ((sub.d ->> 'impact')::integer) DESC)
     FROM (SELECT d.value AS d FROM jsonb_array_elements(jsonb_build_array(
       CASE WHEN s.compliance_overdue_tasks >= 3 THEN jsonb_build_object('driver','Critical Overdue Compliance','impact',70,'value',s.compliance_overdue_tasks || ' overdue tasks') ELSE NULL END,
       jsonb_build_object('driver','Critical stage','value',(s.critical_stage_count || ' critical, ' || s.at_risk_stage_count) || ' at risk','impact',round(0.25 * s.stage_score::numeric)),
       jsonb_build_object('driver','Mandatory gaps','value',s.mandatory_gaps_count || ' missing categories','impact',round(0.20 * s.gaps_score::numeric)),
       jsonb_build_object('driver','Rising risk','value',CASE WHEN COALESCE(s.risk_index_delta_14d,0)>0 THEN '+'||s.risk_index_delta_14d||' risk index in 14d' ELSE 'Index '||COALESCE(s.risk_index,0) END,'impact',round(0.15 * s.risk_score::numeric)),
       jsonb_build_object('driver','Compliance Tasks','value',(s.compliance_overdue_tasks || ' overdue, ' || s.compliance_blocked_tasks) || ' blocked','impact',round(0.15 * s.task_score::numeric)),
       jsonb_build_object('driver','Inactivity','value',s.days_since_activity || ' days since activity','impact',round(0.15 * s.staleness_score::numeric)),
       jsonb_build_object('driver','Renewal pressure','value',CASE WHEN s.days_to_renewal IS NOT NULL THEN s.days_to_renewal || ' days to renewal' ELSE 'No renewal date' END,'impact',round(0.05 * s.renewal_score::numeric)),
       jsonb_build_object('driver','Burn pressure','value',s.burn_risk_status,'impact',round(0.05 * s.burn_score::numeric))
     )) d(value) WHERE d.value IS NOT NULL AND d.value <> 'null'::jsonb AND ((d.value ->> 'impact')::integer) > 0 LIMIT 3) sub
    ) AS attention_drivers_json
  FROM sub_scores s
)
SELECT f.tenant_id, f.tenant_name, f.tenant_status, f.abn, f.rto_id, f.cricos_id, f.assigned_csc_user_id,
  f.packages_json, f.risk_status, f.risk_index, f.risk_index_delta_14d, f.worst_stage_health_status,
  f.critical_stage_count, f.at_risk_stage_count, f.open_tasks_count, f.overdue_tasks_count,
  f.mandatory_gaps_count, f.consult_hours_30d, f.burn_risk_status, f.projected_exhaustion_date,
  f.retention_status, f.composite_retention_risk_index, f.last_activity_at, f.renewal_window_start,
  f.high_severity_open_risks, f.days_since_activity, f.days_to_renewal,
  f.compliance_overdue_tasks, f.compliance_blocked_tasks, f.compliance_open_tasks,
  f.stage_score, f.gaps_score, f.risk_score, f.task_score, f.staleness_score, f.renewal_score, f.burn_score,
  f.attention_score, f.attention_drivers_json
FROM final f
ORDER BY f.attention_score DESC, f.critical_stage_count DESC, f.mandatory_gaps_count DESC,
  f.risk_index_delta_14d DESC, f.days_since_activity DESC, f.renewal_window_start;

-- 8. Recreate v_dashboard_behavioural_prompts
CREATE VIEW public.v_dashboard_behavioural_prompts
WITH (security_invoker = true)
AS
SELECT 'no-consult-30d-' || p.tenant_id AS item_id, 'behavioural_prompt' AS item_type, 'moderate' AS severity,
  p.tenant_id, NULL::text AS stage_instance_id, NULL::text AS standard_clause,
  'No consult logged in 30 days – ' || p.tenant_name AS summary,
  p.assigned_csc_user_id AS owner_user_id, now() AS created_at,
  'No consulting activity recorded in the past 30 days. Consider scheduling a check-in.' AS why_text
FROM v_dashboard_tenant_portfolio p WHERE p.consult_hours_30d = 0
UNION ALL
SELECT 'inactive-21d-' || p.tenant_id, 'behavioural_prompt', 'moderate',
  p.tenant_id, NULL, NULL,
  'Low engagement – ' || p.tenant_name || ' (' || COALESCE(EXTRACT(epoch FROM now() - p.last_activity_at) / 86400, 999)::integer || 'd inactive)',
  p.assigned_csc_user_id, now(),
  'No task updates, uploads, or notes for over 21 days. May indicate a hidden blocker.'
FROM v_dashboard_tenant_portfolio p WHERE COALESCE(EXTRACT(epoch FROM now() - p.last_activity_at) / 86400, 999) > 21
UNION ALL
SELECT 'gap-check-60d-' || p.tenant_id, 'behavioural_prompt', 'moderate',
  p.tenant_id, NULL, NULL,
  'Evidence gap check overdue – ' || p.tenant_name,
  p.assigned_csc_user_id, now(),
  'No evidence gap analysis run recently. Mandatory categories may have drifted.'
FROM v_dashboard_tenant_portfolio p
WHERE p.mandatory_gaps_count > 0 AND COALESCE(EXTRACT(epoch FROM now() - p.last_activity_at) / 86400, 999) > 14;

-- 9. Recreate v_dashboard_labour_efficiency
CREATE VIEW public.v_dashboard_labour_efficiency
WITH (security_invoker = true)
AS
SELECT u.user_uuid AS csc_user_id,
  (u.first_name || ' ' || u.last_name) AS csc_name,
  count(DISTINCT tp.tenant_id) AS client_count,
  COALESCE(ccp.effective_weekly_capacity_hours, 0) AS weekly_capacity_hours,
  COALESCE(sum(tp.overdue_tasks_count), 0) AS total_overdue_tasks,
  COALESCE(sum(tp.open_tasks_count), 0) AS total_open_tasks,
  CASE WHEN COALESCE(sum(tp.open_tasks_count), 0) = 0 THEN 0
    ELSE round(sum(tp.overdue_tasks_count)::numeric / NULLIF(sum(tp.open_tasks_count), 0)::numeric * 100, 1) END AS overdue_ratio_pct,
  count(DISTINCT tp.tenant_id) FILTER (WHERE tp.worst_stage_health_status IN ('critical','at_risk') OR tp.risk_status IN ('high','elevated')) AS intensive_clients,
  count(DISTINCT tp.tenant_id) FILTER (WHERE tp.worst_stage_health_status NOT IN ('critical','at_risk') AND tp.risk_status NOT IN ('high','elevated')) AS low_touch_clients
FROM users u
LEFT JOIN v_dashboard_tenant_portfolio tp ON tp.assigned_csc_user_id = u.user_uuid
LEFT JOIN consultant_capacity_profiles ccp ON ccp.user_id = u.user_uuid
WHERE u.unicorn_role = ANY(ARRAY['Super Admin'::unicorn_role, 'Team Leader'::unicorn_role, 'Team Member'::unicorn_role])
GROUP BY u.user_uuid, u.first_name, u.last_name, ccp.effective_weekly_capacity_hours;
