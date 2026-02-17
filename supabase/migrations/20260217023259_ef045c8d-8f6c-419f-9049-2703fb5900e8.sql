
-- ============================================================
-- Fix 1: Enable RLS on tables missing it
-- ============================================================

-- behavioural_prompts: tenant-scoped data, needs RLS + policies
ALTER TABLE public.behavioural_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY behavioural_prompts_staff_select
  ON public.behavioural_prompts FOR SELECT TO authenticated
  USING (public.is_vivacity_staff(auth.uid()) AND public.can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY behavioural_prompts_staff_insert
  ON public.behavioural_prompts FOR INSERT TO authenticated
  WITH CHECK (public.is_vivacity_staff(auth.uid()) AND public.can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY behavioural_prompts_staff_update
  ON public.behavioural_prompts FOR UPDATE TO authenticated
  USING (public.is_vivacity_staff(auth.uid()) AND public.can_access_tenant(auth.uid(), tenant_id))
  WITH CHECK (public.is_vivacity_staff(auth.uid()) AND public.can_access_tenant(auth.uid(), tenant_id));

CREATE POLICY behavioural_prompts_staff_delete
  ON public.behavioural_prompts FOR DELETE TO authenticated
  USING (public.is_vivacity_staff(auth.uid()) AND public.can_access_tenant(auth.uid(), tenant_id));

-- consult_logs_unmapped_quarantine: admin-only quarantine table
ALTER TABLE public.consult_logs_unmapped_quarantine ENABLE ROW LEVEL SECURITY;

CREATE POLICY quarantine_superadmin_select
  ON public.consult_logs_unmapped_quarantine FOR SELECT TO authenticated
  USING (public.is_super_admin_safe(auth.uid()));

CREATE POLICY quarantine_superadmin_delete
  ON public.consult_logs_unmapped_quarantine FOR DELETE TO authenticated
  USING (public.is_super_admin_safe(auth.uid()));

-- ============================================================
-- Fix 2: Add security_invoker=true to all views missing it
-- Drop dependent views first, then recreate in order
-- ============================================================

-- Drop dependents first
DROP VIEW IF EXISTS public.v_tenant_tasks;
DROP VIEW IF EXISTS public.v_exec_execution_momentum_7d;
DROP VIEW IF EXISTS public.v_exec_alignment_signals_7d;

-- Now drop and recreate base views with security_invoker
DROP VIEW IF EXISTS public.v_dashboard_behavioural_prompts;
CREATE OR REPLACE VIEW public.v_dashboard_behavioural_prompts
WITH (security_invoker = true)
AS
SELECT 'no-consult-30d-' || p.tenant_id AS item_id,
    'behavioural_prompt' AS item_type,
    'moderate' AS severity,
    p.tenant_id,
    NULL::text AS stage_instance_id,
    NULL::text AS standard_clause,
    'No consult logged in 30 days – ' || p.tenant_name AS summary,
    p.assigned_csc_user_id AS owner_user_id,
    now() AS created_at,
    'No consulting activity recorded in the past 30 days. Consider scheduling a check-in.' AS why_text
   FROM v_dashboard_tenant_portfolio p
  WHERE p.consult_hours_30d = 0
UNION ALL
 SELECT 'inactive-21d-' || p.tenant_id AS item_id,
    'behavioural_prompt' AS item_type,
    'moderate' AS severity,
    p.tenant_id,
    NULL::text AS stage_instance_id,
    NULL::text AS standard_clause,
    'Low engagement – ' || p.tenant_name || ' (' || COALESCE(EXTRACT(epoch FROM now() - p.last_activity_at) / 86400, 999)::integer || 'd inactive)' AS summary,
    p.assigned_csc_user_id AS owner_user_id,
    now() AS created_at,
    'No task updates, uploads, or notes for over 21 days. May indicate a hidden blocker.' AS why_text
   FROM v_dashboard_tenant_portfolio p
  WHERE COALESCE(EXTRACT(epoch FROM now() - p.last_activity_at) / 86400, 999) > 21
UNION ALL
 SELECT 'gap-check-60d-' || p.tenant_id AS item_id,
    'behavioural_prompt' AS item_type,
    'moderate' AS severity,
    p.tenant_id,
    NULL::text AS stage_instance_id,
    NULL::text AS standard_clause,
    'Evidence gap check overdue – ' || p.tenant_name AS summary,
    p.assigned_csc_user_id AS owner_user_id,
    now() AS created_at,
    'No evidence gap analysis run recently. Mandatory categories may have drifted.' AS why_text
   FROM v_dashboard_tenant_portfolio p
  WHERE p.mandatory_gaps_count > 0 AND COALESCE(EXTRACT(epoch FROM now() - p.last_activity_at) / 86400, 999) > 14;

DROP VIEW IF EXISTS public.v_dashboard_tenant_recent_comms;
CREATE OR REPLACE VIEW public.v_dashboard_tenant_recent_comms
WITH (security_invoker = true)
AS
WITH ranked_notes AS (
  SELECT n.tenant_id, n.id, n.created_at, n.created_by, n.note_type, n.title,
    left(n.note_details, 120) AS preview,
    row_number() OVER (PARTITION BY n.tenant_id ORDER BY n.created_at DESC) AS rn
  FROM notes n
), ranked_emails AS (
  SELECT em.tenant_id, em.id, em.received_at AS created_at, em.subject,
    left(em.body_preview, 120) AS preview, em.sender_name, em.sender_email,
    row_number() OVER (PARTITION BY em.tenant_id ORDER BY em.received_at DESC) AS rn
  FROM email_messages em WHERE em.tenant_id IS NOT NULL
)
SELECT t.id AS tenant_id,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id', rn2.id, 'created_at', rn2.created_at, 'author_id', rn2.created_by, 'type', rn2.note_type, 'title', rn2.title, 'preview', rn2.preview) ORDER BY rn2.created_at DESC)
    FROM ranked_notes rn2 WHERE rn2.tenant_id = t.id AND rn2.rn <= 5), '[]'::jsonb) AS recent_notes_json,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id', re2.id, 'created_at', re2.created_at, 'subject', re2.subject, 'preview', re2.preview, 'sender_name', re2.sender_name, 'sender_email', re2.sender_email) ORDER BY re2.created_at DESC)
    FROM ranked_emails re2 WHERE re2.tenant_id = t.id AND re2.rn <= 5), '[]'::jsonb) AS recent_emails_json
FROM tenants t WHERE t.status = 'active';

DROP VIEW IF EXISTS public.v_exec_consult_hours_7d;
CREATE OR REPLACE VIEW public.v_exec_consult_hours_7d
WITH (security_invoker = true)
AS
WITH windows AS (
  SELECT now() - '7 days'::interval AS w0_from, now() AS w0_to,
         now() - '14 days'::interval AS w1_from, now() - '7 days'::interval AS w1_to
), base AS (
  SELECT DISTINCT cl.consult_id, cl.client_id, cl.created_at, cl.hours FROM consult_logs cl
)
SELECT cleg.tenant_id,
  COALESCE(sum(b.hours) FILTER (WHERE b.created_at >= w.w0_from AND b.created_at < w.w0_to), 0) AS consult_hours_logged_7d,
  COALESCE(sum(b.hours) FILTER (WHERE b.created_at >= w.w1_from AND b.created_at < w.w1_to), 0) AS consult_hours_logged_prev_7d,
  COALESCE(sum(b.hours) FILTER (WHERE b.created_at >= w.w0_from AND b.created_at < w.w0_to), 0) - COALESCE(sum(b.hours) FILTER (WHERE b.created_at >= w.w1_from AND b.created_at < w.w1_to), 0) AS consult_hours_logged_delta
FROM base b JOIN clients_legacy cleg ON cleg.id = b.client_id CROSS JOIN windows w
GROUP BY cleg.tenant_id;

DROP VIEW IF EXISTS public.v_exec_phases_completed_7d;
CREATE OR REPLACE VIEW public.v_exec_phases_completed_7d
WITH (security_invoker = true)
AS
WITH windows AS (
  SELECT now() - '7 days'::interval AS w0_from, now() AS w0_to,
         now() - '14 days'::interval AS w1_from, now() - '7 days'::interval AS w1_to
), completed AS (
  SELECT DISTINCT sal.id, sal.stage_state_id, sal.changed_at
  FROM stage_state_audit_log sal WHERE lower(sal.new_status) = 'completed'
)
SELECT cpss.tenant_id,
  count(*) FILTER (WHERE c.changed_at >= w.w0_from AND c.changed_at < w.w0_to) AS phases_completed_7d,
  count(*) FILTER (WHERE c.changed_at >= w.w1_from AND c.changed_at < w.w1_to) AS phases_completed_prev_7d,
  count(*) FILTER (WHERE c.changed_at >= w.w0_from AND c.changed_at < w.w0_to) - count(*) FILTER (WHERE c.changed_at >= w.w1_from AND c.changed_at < w.w1_to) AS phases_completed_delta
FROM completed c JOIN client_package_stage_state cpss ON cpss.id = c.stage_state_id CROSS JOIN windows w
GROUP BY cpss.tenant_id;

DROP VIEW IF EXISTS public.v_exec_system_health;
CREATE OR REPLACE VIEW public.v_exec_system_health
WITH (security_invoker = true)
AS
SELECT cpss_tenants.tenant_id,
  count(DISTINCT cpss_tenants.tenant_id) AS active_clients,
  count(DISTINCT cs_match.tenant_id) AS clients_with_compliance_snapshot,
  round(100.0 * count(DISTINCT cs_match.tenant_id)::numeric / NULLIF(count(DISTINCT cpss_tenants.tenant_id), 0)::numeric, 1) AS compliance_coverage_pct,
  max(cs_match.calculated_at) AS latest_compliance_snapshot_at
FROM (SELECT DISTINCT tenant_id FROM client_package_stage_state) cpss_tenants
  LEFT JOIN v_compliance_score_latest cs_match ON cs_match.tenant_id = cpss_tenants.tenant_id
GROUP BY cpss_tenants.tenant_id;

DROP VIEW IF EXISTS public.v_executive_watchlist_7d;
CREATE OR REPLACE VIEW public.v_executive_watchlist_7d
WITH (security_invoker = true)
AS
SELECT cd.tenant_id, cd.package_instance_id,
  'compliance_drop' AS change_type,
  cd.delta_overall_score_7d AS change_value,
  cd.t7_overall_score AS baseline_value,
  cd.t0_overall_score AS current_value
FROM v_compliance_score_deltas_7d cd WHERE cd.delta_overall_score_7d <= -10
UNION ALL
SELECT rd.tenant_id, rd.package_instance_id,
  'risk_band_worsened' AS change_type,
  rd.delta_operational_risk_7d AS change_value,
  rd.t7_operational_risk_score AS baseline_value,
  rd.t0_operational_risk_score AS current_value
FROM v_predictive_risk_deltas_7d rd
WHERE rd.risk_band_change_7d = 'changed'
  AND (rd.t0_risk_band = 'immediate_attention' AND rd.t7_risk_band IN ('at_risk','watch','stable')
    OR rd.t0_risk_band = 'at_risk' AND rd.t7_risk_band IN ('watch','stable')
    OR rd.t0_risk_band = 'watch' AND rd.t7_risk_band = 'stable')
UNION ALL
SELECT rd.tenant_id, rd.package_instance_id,
  'predictive_spike' AS change_type,
  rd.delta_operational_risk_7d AS change_value,
  rd.t7_operational_risk_score AS baseline_value,
  rd.t0_operational_risk_score AS current_value
FROM v_predictive_risk_deltas_7d rd WHERE rd.delta_operational_risk_7d >= 15
UNION ALL
SELECT cd.tenant_id, cd.package_instance_id,
  'newly_stale' AS change_type,
  cd.t0_days_stale AS change_value,
  COALESCE(cd.t7_days_stale, 0) AS baseline_value,
  cd.t0_days_stale AS current_value
FROM v_compliance_score_deltas_7d cd
WHERE COALESCE(cd.t7_days_stale, 0) <= 14 AND cd.t0_days_stale > 14;

DROP VIEW IF EXISTS public.v_tasks_unmapped;
CREATE OR REPLACE VIEW public.v_tasks_unmapped
WITH (security_invoker = true)
AS
SELECT t.id, t.task_id, t.task_name, t.space_name, t.folder_name_path, t.list_name,
  resolve_tenant_for_task(t.id) AS suggested_tenant_id
FROM tasks t
WHERE NOT EXISTS (SELECT 1 FROM task_tenant_map ttm WHERE ttm.task_id = t.task_id);

DROP VIEW IF EXISTS public.v_tenant_task_requirements;
CREATE OR REPLACE VIEW public.v_tenant_task_requirements
WITH (security_invoker = true)
AS
WITH package_scoped AS (
  SELECT ta.id AS assignment_id, pi.tenant_id, ta.task_id, ta.is_required, ta.due_days_after_start,
    COALESCE(ta.tenant_scope_start_at, pi.start_date::timestamptz) AS scope_start_at,
    'package' AS derived_from
  FROM task_assignments ta
    JOIN package_instances pi ON pi.package_id = ta.package_id AND pi.is_active = true AND pi.is_complete = false
  WHERE ta.scope_type = 'package'
), tenant_scoped AS (
  SELECT ta.id AS assignment_id, ta.tenant_id, ta.task_id, ta.is_required, ta.due_days_after_start,
    ta.tenant_scope_start_at AS scope_start_at,
    'tenant' AS derived_from
  FROM task_assignments ta WHERE ta.scope_type = 'tenant'
)
SELECT r.assignment_id, r.tenant_id, r.task_id, r.is_required, r.due_days_after_start,
  r.scope_start_at, r.derived_from,
  CASE
    WHEN r.due_days_after_start IS NULL THEN NULL::timestamptz
    WHEN r.scope_start_at IS NULL THEN now() + (r.due_days_after_start || ' days')::interval
    ELSE r.scope_start_at + (r.due_days_after_start || ' days')::interval
  END AS due_at
FROM (SELECT * FROM package_scoped UNION ALL SELECT * FROM tenant_scoped) r;

DROP VIEW IF EXISTS public.v_dashboard_attention_ranked;
CREATE OR REPLACE VIEW public.v_dashboard_attention_ranked
WITH (security_invoker = true)
AS
WITH base AS (
  SELECT p.tenant_id, p.tenant_name, p.tenant_status, p.abn, p.rto_id, p.cricos_id,
    p.assigned_csc_user_id, p.packages_json, p.risk_status, p.risk_index, p.risk_index_delta_14d,
    p.worst_stage_health_status, p.critical_stage_count, p.at_risk_stage_count,
    p.open_tasks_count, p.overdue_tasks_count, p.mandatory_gaps_count,
    p.consult_hours_30d, p.burn_risk_status, p.projected_exhaustion_date,
    p.retention_status, p.composite_retention_risk_index, p.last_activity_at,
    tcp.renewal_window_start,
    COALESCE(hsr.high_severity_open_risks, 0) AS high_severity_open_risks,
    COALESCE(EXTRACT(epoch FROM now() - p.last_activity_at) / 86400, 999)::integer AS days_since_activity,
    CASE WHEN tcp.renewal_window_start IS NOT NULL THEN tcp.renewal_window_start - CURRENT_DATE ELSE NULL::integer END AS days_to_renewal
  FROM v_dashboard_tenant_portfolio p
    LEFT JOIN tenant_commercial_profiles tcp ON tcp.tenant_id = p.tenant_id
    LEFT JOIN LATERAL (SELECT count(*)::integer AS high_severity_open_risks FROM risk_events re WHERE re.tenant_id = p.tenant_id AND re.severity = 'high' AND re.status = 'open') hsr ON true
), sub_scores AS (
  SELECT b.*,
    LEAST(100, GREATEST(0,
      CASE b.worst_stage_health_status WHEN 'critical' THEN 100 WHEN 'at_risk' THEN 70 WHEN 'monitoring' THEN 35 ELSE 0 END
      + LEAST(b.critical_stage_count * 10, 20) + LEAST(b.at_risk_stage_count * 5, 15))) AS stage_score,
    CASE WHEN b.mandatory_gaps_count = 0 THEN 0 ELSE LEAST(100, b.mandatory_gaps_count * 20) END AS gaps_score,
    LEAST(100, GREATEST(0, COALESCE(b.risk_index, 0)::numeric + LEAST(25, GREATEST(0, COALESCE(b.risk_index_delta_14d, 0)::numeric * 1.5)) + LEAST(25, b.high_severity_open_risks * 10)::numeric))::integer AS risk_score,
    LEAST(100,
      CASE WHEN b.days_since_activity <= 7 THEN 0 WHEN b.days_since_activity <= 14 THEN 25 WHEN b.days_since_activity <= 21 THEN 50 WHEN b.days_since_activity <= 30 THEN 75 ELSE 100 END
      + CASE WHEN b.open_tasks_count > 0 AND b.days_since_activity >= 15 THEN 10 ELSE 0 END) AS staleness_score,
    CASE WHEN b.days_to_renewal IS NULL THEN 0 WHEN b.days_to_renewal <= 0 THEN 100 WHEN b.days_to_renewal <= 14 THEN 100 WHEN b.days_to_renewal <= 30 THEN 75 WHEN b.days_to_renewal <= 60 THEN 50 WHEN b.days_to_renewal <= 90 THEN 25 ELSE 0 END AS renewal_score,
    LEAST(100,
      CASE b.burn_risk_status WHEN 'critical' THEN 100 WHEN 'accelerated' THEN 50 ELSE 0 END
      + CASE WHEN b.projected_exhaustion_date IS NOT NULL AND (b.projected_exhaustion_date - CURRENT_DATE) <= 30 THEN 15 ELSE 0 END) AS burn_score
  FROM base b
), final AS (
  SELECT s.*,
    calculate_attention_score(s.stage_score::numeric, s.gaps_score::numeric, s.risk_score::numeric, s.staleness_score::numeric, s.renewal_score::numeric, s.burn_score::numeric) AS attention_score,
    (SELECT jsonb_agg(sub.d ORDER BY (sub.d ->> 'impact')::integer DESC)
     FROM (SELECT d.value AS d
           FROM jsonb_array_elements(jsonb_build_array(
             jsonb_build_object('driver','Critical stage','value',(s.critical_stage_count || ' critical, ' || s.at_risk_stage_count) || ' at risk','impact',round(0.30 * s.stage_score::numeric)),
             jsonb_build_object('driver','Mandatory gaps','value',s.mandatory_gaps_count || ' missing categories','impact',round(0.20 * s.gaps_score::numeric)),
             jsonb_build_object('driver','Rising risk','value',CASE WHEN COALESCE(s.risk_index_delta_14d, 0) > 0 THEN '+' || s.risk_index_delta_14d || ' risk index in 14d' ELSE 'Index ' || COALESCE(s.risk_index, 0) END,'impact',round(0.20 * s.risk_score::numeric)),
             jsonb_build_object('driver','Inactivity','value',s.days_since_activity || ' days since activity','impact',round(0.15 * s.staleness_score::numeric)),
             jsonb_build_object('driver','Renewal pressure','value',CASE WHEN s.days_to_renewal IS NOT NULL THEN s.days_to_renewal || ' days to renewal' ELSE 'No renewal date' END,'impact',round(0.10 * s.renewal_score::numeric)),
             jsonb_build_object('driver','Burn pressure','value',s.burn_risk_status,'impact',round(0.05 * s.burn_score::numeric))
           )) d(value) WHERE (d.value ->> 'impact')::integer > 0 LIMIT 3) sub) AS attention_drivers_json
  FROM sub_scores s
)
SELECT f.tenant_id, f.tenant_name, f.tenant_status, f.abn, f.rto_id, f.cricos_id,
  f.assigned_csc_user_id, f.packages_json, f.risk_status, f.risk_index, f.risk_index_delta_14d,
  f.worst_stage_health_status, f.critical_stage_count, f.at_risk_stage_count,
  f.open_tasks_count, f.overdue_tasks_count, f.mandatory_gaps_count,
  f.consult_hours_30d, f.burn_risk_status, f.projected_exhaustion_date,
  f.retention_status, f.composite_retention_risk_index, f.last_activity_at,
  f.renewal_window_start, f.high_severity_open_risks, f.days_since_activity, f.days_to_renewal,
  f.stage_score, f.gaps_score, f.risk_score, f.staleness_score, f.renewal_score, f.burn_score,
  f.attention_score, f.attention_drivers_json
FROM final f
ORDER BY f.attention_score DESC, f.critical_stage_count DESC, f.mandatory_gaps_count DESC, f.risk_index_delta_14d DESC, f.days_since_activity DESC, f.renewal_window_start;

-- Now recreate dependent views with security_invoker
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
  FROM eos_issues ei CROSS JOIN windows w WHERE ei.resolved_at IS NOT NULL GROUP BY ei.tenant_id
), documents_generated AS (
  SELECT gd.tenant_id,
    count(*) FILTER (WHERE gd.created_at >= w.w0_from AND gd.created_at < w.w0_to) AS w0,
    count(*) FILTER (WHERE gd.created_at >= w.w1_from AND gd.created_at < w.w1_to) AS w1
  FROM generated_documents gd CROSS JOIN windows w GROUP BY gd.tenant_id
), document_events AS (
  SELECT dal.tenant_id,
    count(*) FILTER (WHERE dal.occurred_at >= w.w0_from AND dal.occurred_at < w.w0_to) AS w0,
    count(*) FILTER (WHERE dal.occurred_at >= w.w1_from AND dal.occurred_at < w.w1_to) AS w1
  FROM document_activity_log dal CROSS JOIN windows w GROUP BY dal.tenant_id
), tenants_union AS (
  SELECT tenant_id FROM risks_resolved UNION SELECT tenant_id FROM documents_generated
  UNION SELECT tenant_id FROM document_events UNION SELECT tenant_id FROM v_exec_consult_hours_7d
  UNION SELECT tenant_id FROM v_exec_phases_completed_7d
)
SELECT t.tenant_id,
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
FROM tenants_union t
  LEFT JOIN risks_resolved rr ON rr.tenant_id = t.tenant_id
  LEFT JOIN documents_generated dg ON dg.tenant_id = t.tenant_id
  LEFT JOIN document_events de ON de.tenant_id = t.tenant_id
  LEFT JOIN v_exec_phases_completed_7d pc ON pc.tenant_id = t.tenant_id
  LEFT JOIN v_exec_consult_hours_7d ch ON ch.tenant_id = t.tenant_id;

CREATE OR REPLACE VIEW public.v_exec_alignment_signals_7d
WITH (security_invoker = true)
AS
WITH params AS (
  SELECT now() - '7 days'::interval AS from_7d, now() AS to_now
), critical_risks AS (
  SELECT 'critical_risk_created' AS signal_type, 'critical' AS severity,
    'New critical risk created' AS title, COALESCE(ei.title, ei.description, '') AS detail,
    ei.tenant_id, NULL::bigint AS package_instance_id, ei.assigned_to AS owner_user_uuid,
    ei.created_at AS happened_at, 'critical_risk:' || ei.id::text AS source_key,
    1 AS priority_rank, 'Discuss risk response and owner.' AS suggested_discussion
  FROM eos_issues ei, params p
  WHERE lower(COALESCE(ei.impact, '')) = 'critical' AND ei.created_at >= p.from_7d AND ei.deleted_at IS NULL
), stalled_packages AS (
  SELECT 'stalled' AS signal_type, 'warning' AS severity, 'Stalled > 14 days' AS title,
    'Last activity: ' || to_char(sp.max_updated, 'DD Mon YYYY') AS detail,
    sp.tenant_id, NULL::bigint AS package_instance_id, sp.assigned_csc_user_id AS owner_user_uuid,
    sp.max_updated AS happened_at, 'stalled:' || sp.package_id::text AS source_key,
    2 AS priority_rank, 'Discuss unblock plan and next action.' AS suggested_discussion
  FROM (SELECT cp.id AS package_id, cp.tenant_id, cp.assigned_csc_user_id, max(cpss.updated_at) AS max_updated
        FROM client_packages cp JOIN client_package_stage_state cpss ON cpss.package_id = cp.package_id AND cpss.tenant_id = cp.tenant_id
        WHERE COALESCE(cp.status, '') NOT IN ('archived','completed')
        GROUP BY cp.id, cp.tenant_id, cp.assigned_csc_user_id
        HAVING max(cpss.updated_at) <= (now() - '14 days'::interval)) sp
), phase_completed AS (
  SELECT 'phase_completed' AS signal_type, 'info' AS severity, 'Phase completed' AS title,
    '' AS detail, cpss.tenant_id, NULL::bigint AS package_instance_id,
    sal.changed_by AS owner_user_uuid, sal.changed_at AS happened_at,
    'phase:' || sal.id::text AS source_key, 5 AS priority_rank,
    'Confirm next phase and timing.' AS suggested_discussion
  FROM stage_state_audit_log sal JOIN client_package_stage_state cpss ON cpss.id = sal.stage_state_id CROSS JOIN params p
  WHERE lower(sal.new_status) = 'completed' AND sal.changed_at >= p.from_7d
), consult_spike AS (
  SELECT 'consult_spike' AS signal_type, 'info' AS severity, 'High consult hours this week' AS title,
    round(sum(cl.hours), 1)::text || 'h total' AS detail,
    cleg.tenant_id, NULL::bigint AS package_instance_id, NULL::uuid AS owner_user_uuid,
    max(cl.created_at) AS happened_at, 'consult_spike:' || cleg.tenant_id::text AS source_key,
    4 AS priority_rank, 'Discuss resourcing and scope pressure.' AS suggested_discussion
  FROM consult_logs cl JOIN clients_legacy cleg ON cleg.id = cl.client_id CROSS JOIN params p
  WHERE cl.created_at >= p.from_7d GROUP BY cleg.tenant_id HAVING sum(cl.hours) >= 8
), anomaly_signals AS (
  SELECT 'anomaly' AS signal_type, COALESCE(a.severity, 'warning') AS severity,
    a.anomaly_type AS title, 'Delta: ' || COALESCE(a.delta_value::text, '0') AS detail,
    a.tenant_id, a.package_instance_id, NULL::uuid AS owner_user_uuid,
    a.detected_at::timestamptz AS happened_at,
    'anomaly:' || a.tenant_id || ':' || COALESCE(a.package_instance_id::text, '0') || ':' || a.anomaly_type AS source_key,
    3 AS priority_rank, 'Discuss cause and corrective action.' AS suggested_discussion
  FROM v_executive_anomalies_30d a, params p WHERE a.detected_at >= p.from_7d::date
), watchlist_signals AS (
  SELECT 'watchlist' AS signal_type, 'warning' AS severity, w.change_type AS title,
    'Value: ' || COALESCE(w.change_value::text, '') AS detail,
    w.tenant_id, w.package_instance_id, NULL::uuid AS owner_user_uuid,
    now() AS happened_at,
    'watchlist:' || w.tenant_id || ':' || COALESCE(w.package_instance_id::text, '0') || ':' || w.change_type AS source_key,
    3 AS priority_rank, 'Discuss movement and next step.' AS suggested_discussion
  FROM v_executive_watchlist_7d w
), all_signals AS (
  SELECT * FROM critical_risks UNION ALL SELECT * FROM stalled_packages
  UNION ALL SELECT * FROM phase_completed UNION ALL SELECT * FROM consult_spike
  UNION ALL SELECT * FROM anomaly_signals UNION ALL SELECT * FROM watchlist_signals
), deduped AS (
  SELECT DISTINCT ON (source_key) * FROM all_signals ORDER BY source_key, happened_at DESC
), with_owner AS (
  SELECT d.*, COALESCE(d.owner_user_uuid, fallback_owner.assigned_csc_user_id) AS resolved_owner_uuid
  FROM deduped d
    LEFT JOIN LATERAL (SELECT cp2.assigned_csc_user_id FROM client_packages cp2
      WHERE cp2.tenant_id = d.tenant_id AND cp2.assigned_csc_user_id IS NOT NULL
        AND COALESCE(cp2.status, '') NOT IN ('archived','completed')
      ORDER BY cp2.created_at DESC LIMIT 1) fallback_owner ON d.owner_user_uuid IS NULL
)
SELECT wo.signal_type, wo.severity, wo.title, wo.detail, wo.tenant_id, wo.package_instance_id,
  wo.resolved_owner_uuid AS owner_user_uuid,
  u.first_name || ' ' || u.last_name AS owner_name,
  t.name AS client_name,
  wo.happened_at, wo.source_key, wo.priority_rank, wo.suggested_discussion,
  '/clients/' || wo.tenant_id::text AS deep_link_href
FROM with_owner wo
  LEFT JOIN users u ON u.user_uuid = wo.resolved_owner_uuid
  LEFT JOIN tenants t ON t.id = wo.tenant_id
ORDER BY wo.priority_rank, wo.happened_at DESC;

-- Recreate v_tenant_tasks (depends on v_tenant_task_requirements)
CREATE OR REPLACE VIEW public.v_tenant_tasks
WITH (security_invoker = true)
AS
SELECT r.tenant_id, r.assignment_id, r.task_id, r.derived_from,
  r.is_required, r.scope_start_at, r.due_at,
  COALESCE(ts.status, 'open') AS tenant_status,
  ts.completed_at, ts.completed_by,
  t.task_name, t.status AS clickup_status, t.priority, t.due_date_at,
  t.space_name, t.folder_name_path, t.list_name
FROM v_tenant_task_requirements r
  LEFT JOIN tenant_task_status ts ON ts.tenant_id = r.tenant_id AND ts.assignment_id = r.assignment_id
  LEFT JOIN tasks t ON t.task_id = r.task_id;
