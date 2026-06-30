-- =====================================================================
-- Phase D: replace status_id predicates with canonical text status
-- All CREATE OR REPLACE; no column-order changes; no grants altered on views.
-- =====================================================================

-- 1) v_admin_zero_progress_packages — genuinely-done set
CREATE OR REPLACE VIEW public.v_admin_zero_progress_packages AS
WITH stage_counts AS (
  SELECT si.packageinstance_id,
         count(*)::integer AS stages_total,
         count(*) FILTER (WHERE si.status IN ('completed','core_complete'))::integer AS stages_complete,
         max(si.updated_at) AS max_stage_updated_at
    FROM public.stage_instances si
   GROUP BY si.packageinstance_id
), task_counts AS (
  SELECT cai.package_instance_id,
         count(*) AS ai_total,
         count(*) FILTER (WHERE cai.completed_at IS NOT NULL) AS ai_completed,
         max(cai.updated_at) AS max_ai_updated_at
    FROM public.client_action_items cai
   WHERE cai.package_instance_id IS NOT NULL
   GROUP BY cai.package_instance_id
), legacy_task_counts AS (
  SELECT si.packageinstance_id AS package_instance_id,
         count(*) AS ti_total,
         count(*) FILTER (WHERE cti.completion_date IS NOT NULL) AS ti_completed,
         count(*) FILTER (WHERE COALESCE(cti.is_archived,false) = false AND cti.completion_date IS NULL) AS ti_open,
         max(cti.updated_at) AS max_ti_updated_at
    FROM public.client_task_instances cti
    JOIN public.stage_instances si ON si.id = cti.stageinstance_id
   GROUP BY si.packageinstance_id
), hours AS (
  SELECT te.package_instance_id,
         (COALESCE(sum(te.duration_minutes), 0::bigint))::numeric / 60.0 AS hours_logged,
         max(te.start_at) AS max_te_at
    FROM public.time_entries te
   WHERE te.package_instance_id IS NOT NULL AND te.is_billable = true
   GROUP BY te.package_instance_id
)
SELECT pi.id AS package_instance_id,
       pi.tenant_id,
       t.name AS tenant_name,
       t.legal_name AS tenant_legal_name,
       COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''), p.name) AS package_name,
       p.package_type,
       pi.manager_id,
       pi.start_date,
       pi.end_date,
       (CURRENT_DATE - pi.start_date) AS days_since_start,
       pi.is_active,
       pi.is_complete,
       COALESCE(sc.stages_total, 0) AS stages_total,
       COALESCE(sc.stages_complete, 0) AS stages_complete,
       COALESCE(tc.ai_total, 0::bigint) AS action_items_total,
       COALESCE(tc.ai_completed, 0::bigint) AS action_items_completed,
       COALESCE(ltc.ti_total, 0::bigint) AS legacy_tasks_total,
       COALESCE(ltc.ti_completed, 0::bigint) AS legacy_tasks_completed,
       COALESCE(ltc.ti_open, 0::bigint) AS legacy_tasks_open,
       COALESCE(h.hours_logged, 0::numeric) AS hours_logged,
       GREATEST(
         COALESCE(sc.max_stage_updated_at, '1970-01-01 00:00:00+00'::timestamptz),
         COALESCE(tc.max_ai_updated_at,    '1970-01-01 00:00:00+00'::timestamptz),
         COALESCE(ltc.max_ti_updated_at,   '1970-01-01 00:00:00+00'::timestamptz),
         COALESCE(h.max_te_at,             '1970-01-01 00:00:00+00'::timestamptz)
       ) AS last_activity_at,
       CASE
         WHEN ((COALESCE(tc.ai_completed,0::bigint) + COALESCE(ltc.ti_completed,0::bigint)) = 0
               AND COALESCE(h.hours_logged,0::numeric) = 0::numeric) THEN 'pre_release'
         WHEN GREATEST(
                COALESCE(sc.max_stage_updated_at,'1970-01-01 00:00:00+00'::timestamptz),
                COALESCE(tc.max_ai_updated_at,   '1970-01-01 00:00:00+00'::timestamptz),
                COALESCE(ltc.max_ti_updated_at,  '1970-01-01 00:00:00+00'::timestamptz),
                COALESCE(h.max_te_at,            '1970-01-01 00:00:00+00'::timestamptz)
              ) < (now() - interval '90 days') THEN 'dormant'
         WHEN ((COALESCE(tc.ai_completed,0::bigint) + COALESCE(ltc.ti_completed,0::bigint)) > 0
               OR COALESCE(h.hours_logged,0::numeric) > 0::numeric
               OR GREATEST(
                    COALESCE(sc.max_stage_updated_at,'1970-01-01 00:00:00+00'::timestamptz),
                    COALESCE(tc.max_ai_updated_at,   '1970-01-01 00:00:00+00'::timestamptz),
                    COALESCE(ltc.max_ti_updated_at,  '1970-01-01 00:00:00+00'::timestamptz),
                    COALESCE(h.max_te_at,            '1970-01-01 00:00:00+00'::timestamptz)
                  ) > (now() - interval '30 days')) THEN 'investigate'
         ELSE 'review'
       END AS triage_category
  FROM public.package_instances pi
  JOIN public.tenants t ON t.id = pi.tenant_id
  JOIN public.packages p ON p.id = pi.package_id
  LEFT JOIN stage_counts sc ON sc.packageinstance_id = pi.id
  LEFT JOIN task_counts tc ON tc.package_instance_id = pi.id
  LEFT JOIN legacy_task_counts ltc ON ltc.package_instance_id = pi.id
  LEFT JOIN hours h ON h.package_instance_id = pi.id
 WHERE pi.is_active = true
   AND COALESCE(pi.is_complete,false) = false
   AND pi.start_date IS NOT NULL
   AND pi.start_date < (CURRENT_DATE - interval '60 days')
   AND COALESCE(sc.stages_complete,0) = 0;


-- 2) v_client_dashboard_progress — not-blocking set
CREATE OR REPLACE VIEW public.v_client_dashboard_progress AS
WITH stage_agg AS (
  SELECT si.packageinstance_id AS package_instance_id,
         count(*)::integer AS stages_total,
         count(*) FILTER (WHERE si.status IN ('completed','core_complete','na'))::integer AS stages_complete,
         min(si.stage_sortorder) FILTER (WHERE si.status NOT IN ('completed','core_complete','na')) AS current_stage_sortorder
    FROM public.stage_instances si
    JOIN public.stages s ON s.id = si.stage_id
   WHERE COALESCE(s.is_audit_workspace,false) = false
     AND COALESCE(s.is_archived,false) = false
   GROUP BY si.packageinstance_id
), current_stage AS (
  SELECT DISTINCT ON (si.packageinstance_id) si.packageinstance_id AS package_instance_id,
         COALESCE(NULLIF(TRIM(BOTH FROM s.name), ''), s.shortname) AS phase_name
    FROM public.stage_instances si
    JOIN public.stages s ON s.id = si.stage_id
   WHERE si.status NOT IN ('completed','core_complete','na')
     AND COALESCE(s.is_archived,false) = false
     AND COALESCE(s.is_audit_workspace,false) = false
   ORDER BY si.packageinstance_id, si.stage_sortorder
)
SELECT pi.tenant_id,
       pi.id AS package_instance_id,
       pi.package_id,
       COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''), p.name) AS package_name,
       cs.phase_name AS current_phase_name,
       CASE WHEN COALESCE(sa.stages_total,0) = 0 THEN 0
            ELSE round((100.0 * sa.stages_complete::numeric) / sa.stages_total::numeric)::integer END AS phase_completion,
       GREATEST(COALESCE(sa.stages_total,0) - COALESCE(sa.stages_complete,0), 0) AS steps_remaining,
       CASE WHEN COALESCE(sa.stages_total,0) = 0 THEN 0
            ELSE round((100.0 * sa.stages_complete::numeric) / sa.stages_total::numeric)::integer END AS overall_score,
       0 AS documentation_coverage,
       'on_track'::text AS risk_state,
       CASE WHEN COALESCE(sa.stages_total,0) > 0 AND sa.stages_complete < sa.stages_total THEN 'complete_tasks'
            ELSE 'review_progress' END AS next_best_action_type,
       CASE WHEN COALESCE(sa.stages_total,0) > 0 AND sa.stages_complete < sa.stages_total THEN 'Continue your next stage'
            ELSE 'Review progress summary' END AS next_best_action_label,
       CASE WHEN COALESCE(sa.stages_total,0) > 0 AND sa.stages_complete < sa.stages_total THEN '/client/packages'
            ELSE '/client/home' END AS next_best_action_href,
       now() AS score_calculated_at
  FROM public.package_instances pi
  JOIN public.packages p ON p.id = pi.package_id
  LEFT JOIN stage_agg sa ON sa.package_instance_id = pi.id
  LEFT JOIN current_stage cs ON cs.package_instance_id = pi.id
 WHERE pi.is_complete = false;


-- 3) v_client_home_feed — stages_completed_recent uses GENUINELY-DONE set
CREATE OR REPLACE VIEW public.v_client_home_feed AS
WITH cai_due_upcoming AS (
  SELECT 'coming_up'::text AS feed_section,
         'task_due'::text  AS event_type,
         cai.tenant_id::bigint AS tenant_id,
         cai.package_id    AS package_instance_id,
         cai.due_date::timestamptz AS event_at,
         cai.title,
         NULL::text AS subtitle,
         cai.id::text AS event_uid,
         'client_action_items'::text AS source_table,
         '/client/tasks'::text AS href,
         NULL::text AS package_name
    FROM public.client_action_items cai
   WHERE cai.due_date IS NOT NULL
     AND cai.completed_at IS NULL
     AND COALESCE(cai.status,'open') <> ALL (ARRAY['completed','cancelled'])
     AND cai.due_date >= now()::date
     AND cai.due_date <  (now() + interval '84 days')::date
), cai_overdue AS (
  SELECT 'needs_attention'::text, 'task_overdue'::text,
         cai.tenant_id::bigint, cai.package_id,
         cai.due_date::timestamptz, cai.title, 'Overdue task'::text,
         cai.id::text, 'client_action_items'::text, '/client/tasks'::text, NULL::text
    FROM public.client_action_items cai
   WHERE cai.due_date IS NOT NULL
     AND cai.completed_at IS NULL
     AND COALESCE(cai.status,'open') <> ALL (ARRAY['completed','cancelled'])
     AND cai.due_date < now()::date
), urgent_notes AS (
  SELECT 'needs_attention'::text, 'urgent_note'::text,
         n.tenant_id, n.parent_id, n.updated_at,
         COALESCE(n.title,'Urgent note'),
         NULL::text, n.id::text, 'notes'::text, '/client/packages'::text,
         COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''), p.name)
    FROM public.notes n
    JOIN public.package_instances pi ON pi.id = n.parent_id
    JOIN public.packages p ON p.id = pi.package_id
   WHERE n.parent_type = 'package_instance'
     AND COALESCE(n.is_pinned,false) = true
     AND pi.is_complete = false
     AND lower(COALESCE(n.note_details,'')||' '||COALESCE(n.title,'')) ~ '(urgent|overdue|action required)'
), te_recent AS (
  SELECT 'recent_activity'::text, 'consult_logged'::text,
         pi.tenant_id, pi.id, te.start_at,
         COALESCE(NULLIF(TRIM(BOTH FROM te.work_type), ''), 'Other'),
         NULLIF(TRIM(BOTH FROM te.work_sub_type), ''),
         te.id::text, 'time_entries'::text, '/client/packages'::text,
         COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''), p.name)
    FROM public.time_entries te
    JOIN public.package_instances pi ON pi.id = te.package_instance_id
    JOIN public.packages p ON p.id = pi.package_id
   WHERE te.duration_minutes IS NOT NULL AND te.duration_minutes > 0
     AND te.start_at >= now() - interval '30 days'
     AND (pi.start_date IS NULL OR te.start_at >= pi.start_date)
     AND pi.is_complete = false
     AND te.is_billable = true
), stages_completed_recent AS (
  SELECT 'recent_activity'::text, 'stage_completed'::text,
         pi.tenant_id, pi.id, si.status_date,
         COALESCE(NULLIF(TRIM(BOTH FROM s.name), ''), s.shortname),
         'Stage complete'::text, si.id::text, 'stage_instances'::text, '/client/packages'::text,
         COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''), p.name)
    FROM public.stage_instances si
    JOIN public.package_instances pi ON pi.id = si.packageinstance_id
    JOIN public.packages p ON p.id = pi.package_id
    JOIN public.stages s ON s.id = si.stage_id
   WHERE si.status IN ('completed','core_complete')
     AND si.status_date IS NOT NULL
     AND si.status_date >= now() - interval '30 days'
     AND COALESCE(s.is_archived,false) = false
     AND COALESCE(s.is_audit_workspace,false) = false
     AND pi.is_complete = false
), cai_completed_recent AS (
  SELECT 'recent_activity'::text, 'task_completed'::text,
         cai.tenant_id::bigint, cai.package_id, cai.completed_at,
         cai.title, 'Task completed'::text, cai.id::text,
         'client_action_items'::text, '/client/tasks'::text, NULL::text
    FROM public.client_action_items cai
   WHERE cai.completed_at IS NOT NULL
     AND cai.completed_at >= now() - interval '30 days'
)
SELECT all_events.feed_section, all_events.event_type, all_events.tenant_id,
       all_events.package_instance_id, all_events.event_at, all_events.title,
       all_events.subtitle, all_events.event_uid, all_events.source_table,
       all_events.href, all_events.package_name
  FROM (
        SELECT * FROM cai_due_upcoming
        UNION ALL SELECT * FROM cai_overdue
        UNION ALL SELECT * FROM urgent_notes
        UNION ALL SELECT * FROM te_recent
        UNION ALL SELECT * FROM stages_completed_recent
        UNION ALL SELECT * FROM cai_completed_recent
       ) AS all_events(feed_section, event_type, tenant_id, package_instance_id,
                       event_at, title, subtitle, event_uid, source_table, href, package_name)
 WHERE all_events.event_at IS NOT NULL;


-- 4) v_client_package_dashboard — not-blocking set
CREATE OR REPLACE VIEW public.v_client_package_dashboard AS
WITH stage_agg AS (
  SELECT si.packageinstance_id AS package_instance_id,
         count(*)::integer AS stages_total,
         count(*) FILTER (WHERE si.status IN ('completed','core_complete','na'))::integer AS stages_complete,
         min(si.stage_sortorder) FILTER (WHERE si.status NOT IN ('completed','core_complete','na')) AS current_stage_sortorder,
         max(si.updated_at) AS stage_last_updated
    FROM public.stage_instances si
    JOIN public.package_instances pi_1 ON pi_1.id = si.packageinstance_id
   WHERE app.user_can_access_tenant(pi_1.tenant_id)
   GROUP BY si.packageinstance_id
), current_stage AS (
  SELECT DISTINCT ON (si.packageinstance_id) si.packageinstance_id,
         COALESCE(NULLIF(TRIM(BOTH FROM s.shortname), ''), s.name) AS shortname
    FROM public.stage_instances si
    JOIN public.stages s ON s.id = si.stage_id
    JOIN public.package_instances pi_1 ON pi_1.id = si.packageinstance_id
   WHERE si.status NOT IN ('completed','core_complete','na')
     AND COALESCE(s.is_archived,false) = false
     AND COALESCE(s.is_audit_workspace,false) = false
     AND app.user_can_access_tenant(pi_1.tenant_id)
   ORDER BY si.packageinstance_id, si.stage_sortorder
), action_items_agg AS (
  SELECT cai.package_instance_id,
         count(*)::integer AS open_count,
         count(*) FILTER (WHERE cai.due_date < now()::date)::integer AS overdue_count,
         max(cai.updated_at) AS last_updated
    FROM public.client_action_items cai
   WHERE cai.package_instance_id IS NOT NULL
     AND cai.completed_at IS NULL
     AND COALESCE(cai.status,'open') <> ALL (ARRAY['completed','cancelled'])
     AND app.user_can_access_tenant(cai.tenant_id::bigint)
   GROUP BY cai.package_instance_id
), tasks_agg AS (
  SELECT a.package_instance_id,
         COALESCE(a.open_count,0)    AS open_tasks,
         COALESCE(a.overdue_count,0) AS overdue_tasks,
         a.last_updated              AS tasks_last_updated
    FROM action_items_agg a
), notes_agg AS (
  SELECT n.parent_id AS package_instance_id,
         max(n.updated_at) AS notes_last_updated
    FROM public.notes n
   WHERE n.parent_type = 'package_instance'
     AND n.parent_id IS NOT NULL
     AND app.user_can_access_tenant(n.tenant_id)
   GROUP BY n.parent_id
), pinned AS (
  SELECT DISTINCT ON (n.parent_id) n.parent_id AS package_instance_id,
         n.title AS pinned_note_title,
         n.note_details AS pinned_note_text,
         n.priority AS pinned_note_priority,
         n.updated_at AS pinned_note_updated_at
    FROM public.notes n
   WHERE n.parent_type = 'package_instance'
     AND n.is_pinned = true
     AND n.parent_id IS NOT NULL
     AND app.user_can_access_tenant(n.tenant_id)
   ORDER BY n.parent_id, n.updated_at DESC NULLS LAST
), hours_agg AS (
  SELECT te.package_instance_id,
         (COALESCE(sum(te.duration_minutes),0::bigint))::numeric / 60.0 AS hours_used_calc,
         max(te.start_at) AS max_te_at
    FROM public.time_entries te
    JOIN public.package_instances pi2 ON pi2.id = te.package_instance_id
   WHERE te.package_instance_id IS NOT NULL
     AND te.duration_minutes IS NOT NULL AND te.duration_minutes > 0
     AND (pi2.start_date IS NULL OR te.start_at >= pi2.start_date)
     AND app.user_can_access_tenant(pi2.tenant_id)
     AND te.is_billable = true
   GROUP BY te.package_instance_id
), most_recent_activity AS (
  SELECT pi_1.id AS package_instance_id,
         COALESCE(GREATEST(na_1.notes_last_updated, sa_1.stage_last_updated,
                           ta_1.tasks_last_updated, ha_1.max_te_at),
                  pi_1.start_date::timestamptz) AS last_activity_at
    FROM public.package_instances pi_1
    LEFT JOIN notes_agg na_1 ON na_1.package_instance_id = pi_1.id
    LEFT JOIN stage_agg sa_1 ON sa_1.package_instance_id = pi_1.id
    LEFT JOIN tasks_agg ta_1 ON ta_1.package_instance_id = pi_1.id
    LEFT JOIN hours_agg ha_1 ON ha_1.package_instance_id = pi_1.id
)
SELECT pi.id AS package_instance_id,
       pi.tenant_id,
       COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''), p.name) AS package_name,
       p.package_type, p.progress_mode, pi.manager_id, pi.is_complete,
       pi.start_date, pi.end_date,
       COALESCE(pi.hours_included,0) AS hours_included,
       COALESCE(pi.hours_added,0)    AS hours_added,
       (COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0))::numeric AS hours_total,
       COALESCE(ha.hours_used_calc,0::numeric) AS hours_used,
       GREATEST((COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0))::numeric
                - COALESCE(ha.hours_used_calc,0::numeric), 0::numeric) AS hours_remaining,
       CASE WHEN (COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0)) = 0 THEN 0::numeric
            ELSE round(COALESCE(ha.hours_used_calc,0::numeric)
                       / (COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0))::numeric, 4)
       END AS hours_pct_used,
       COALESCE(sa.stages_total,0)    AS stages_total,
       COALESCE(sa.stages_complete,0) AS stages_complete,
       sa.current_stage_sortorder,
       COALESCE(ta.open_tasks,0)    AS open_tasks,
       COALESCE(ta.overdue_tasks,0) AS overdue_tasks,
       mra.last_activity_at,
       pn.pinned_note_title, pn.pinned_note_text,
       pn.pinned_note_priority, pn.pinned_note_updated_at,
       CASE
         WHEN pn.pinned_note_text IS NULL AND pn.pinned_note_title IS NULL THEN NULL
         WHEN lower(COALESCE(pn.pinned_note_text,'')||' '||COALESCE(pn.pinned_note_title,'')) LIKE '%on hold%' THEN 'hold'
         WHEN lower(COALESCE(pn.pinned_note_text,'')||' '||COALESCE(pn.pinned_note_title,'')) ~ '(urgent|overdue)' THEN 'urgent'
         ELSE 'info'
       END AS pinned_note_severity,
       CASE
         WHEN pn.pinned_note_text IS NOT NULL
              AND lower(COALESCE(pn.pinned_note_text,'')||' '||COALESCE(pn.pinned_note_title,'')) LIKE '%on hold%' THEN 'on_hold'
         WHEN pi.is_complete = true THEN 'complete'
         WHEN mra.last_activity_at < (now() - interval '30 days')
              OR ((COALESCE(p.total_hours,0)+COALESCE(pi.hours_added,0)) > 0
                  AND (COALESCE(ha.hours_used_calc,0::numeric)
                       / (COALESCE(p.total_hours,0)+COALESCE(pi.hours_added,0))::numeric) >= 0.95) THEN 'stuck'
         WHEN mra.last_activity_at < (now() - interval '14 days')
              OR ((COALESCE(p.total_hours,0)+COALESCE(pi.hours_added,0)) > 0
                  AND (COALESCE(ha.hours_used_calc,0::numeric)
                       / (COALESCE(p.total_hours,0)+COALESCE(pi.hours_added,0))::numeric) >= 0.75)
              OR COALESCE(ta.overdue_tasks,0) > 0 THEN 'drifting'
         ELSE 'on_track'
       END AS status_pill,
       cs.shortname AS current_stage_shortname
  FROM public.package_instances pi
  JOIN public.packages p ON p.id = pi.package_id
  LEFT JOIN stage_agg sa ON sa.package_instance_id = pi.id
  LEFT JOIN current_stage cs ON cs.packageinstance_id = pi.id
  LEFT JOIN tasks_agg ta ON ta.package_instance_id = pi.id
  LEFT JOIN notes_agg na ON na.package_instance_id = pi.id
  LEFT JOIN pinned pn ON pn.package_instance_id = pi.id
  LEFT JOIN hours_agg ha ON ha.package_instance_id = pi.id
  LEFT JOIN most_recent_activity mra ON mra.package_instance_id = pi.id;


-- 5) v_client_package_stages — not-blocking set; subquery uses text NOT IN
CREATE OR REPLACE VIEW public.v_client_package_stages AS
SELECT pi.id AS package_instance_id,
       pi.tenant_id,
       si.id AS stage_instance_id,
       s.id  AS stage_id,
       si.stage_sortorder,
       s.name AS stage_name,
       COALESCE(NULLIF(TRIM(BOTH FROM s.shortname), ''), s.name) AS stage_shortname,
       s.description AS stage_description,
       s.is_recurring,
       COALESCE(s.is_audit_workspace,false) AS is_audit_workspace,
       si.completion_date,
       si.status AS raw_status,
       si.event_conducted_date,
       si.updated_at,
       CASE
         WHEN si.status IN ('completed','core_complete','na') THEN 'complete'
         WHEN si.id = (
                SELECT si2.id
                  FROM public.stage_instances si2
                  JOIN public.stages s2 ON s2.id = si2.stage_id
                 WHERE si2.packageinstance_id = pi.id
                   AND si2.status NOT IN ('completed','core_complete','na')
                   AND COALESCE(s2.is_archived,false) = false
                   AND COALESCE(s2.is_audit_workspace,false) = false
                 ORDER BY si2.stage_sortorder
                 LIMIT 1
              ) THEN 'current'
         ELSE 'future'
       END AS node_state
  FROM public.package_instances pi
  JOIN public.stage_instances si ON si.packageinstance_id = pi.id
  JOIN public.stages s ON s.id = si.stage_id
 WHERE COALESCE(s.is_archived,false) = false
   AND COALESCE(s.is_audit_workspace,false) = false;


-- 6) v_phase_progress_summary — not-blocking set
CREATE OR REPLACE VIEW public.v_phase_progress_summary AS
SELECT pi.package_instance_id,
       pi.id AS phase_instance_id,
       pi.phase_id,
       p.title AS phase_title,
       pi.sort_order,
       pi.gate_type,
       pi.status,
       count(ps.id)::integer AS total_stages,
       count(ps.id) FILTER (WHERE ps.is_required)::integer AS required_stages,
       count(si.id) FILTER (WHERE si.status IN ('completed','core_complete','na'))::integer AS completed_stages,
       count(si.id) FILTER (WHERE ps.is_required AND si.status IN ('completed','core_complete','na'))::integer AS completed_required,
       CASE
         WHEN count(ps.id) FILTER (WHERE ps.is_required) = 0 THEN true
         WHEN count(si.id) FILTER (WHERE ps.is_required AND si.status IN ('completed','core_complete','na'))
              >= count(ps.id) FILTER (WHERE ps.is_required) THEN true
         ELSE false
       END AS is_passable
  FROM public.phase_instances pi
  JOIN public.phases p ON p.id = pi.phase_id
  LEFT JOIN public.phase_stages ps ON ps.phase_id = pi.phase_id
  LEFT JOIN public.stage_instances si
         ON si.stage_id = ps.stage_id
        AND si.packageinstance_id = pi.package_instance_id
 GROUP BY pi.id, pi.package_instance_id, pi.phase_id, p.title,
          pi.sort_order, pi.gate_type, pi.status;


-- 7) get_client_package_dashboard — same predicates as v_client_package_dashboard
CREATE OR REPLACE FUNCTION public.get_client_package_dashboard(
  p_tenant_id bigint,
  p_package_instance_id bigint DEFAULT NULL
)
RETURNS TABLE(
  package_instance_id bigint, tenant_id bigint, package_name text, package_type text,
  progress_mode text, manager_id uuid, is_complete boolean, start_date date, end_date date,
  hours_included integer, hours_added integer, hours_total numeric, hours_used numeric,
  hours_remaining numeric, hours_pct_used numeric, stages_total integer, stages_complete integer,
  current_stage_sortorder integer, open_tasks integer, overdue_tasks integer,
  last_activity_at timestamptz, pinned_note_title text, pinned_note_text text,
  pinned_note_priority text, pinned_note_updated_at timestamptz, pinned_note_severity text,
  status_pill text, current_stage_shortname text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
SET row_security = 'off'
AS $function$
  WITH allowed_packages AS (
    SELECT pi.*
      FROM public.package_instances pi
     WHERE pi.tenant_id = p_tenant_id
       AND (p_package_instance_id IS NULL OR pi.id = p_package_instance_id)
       AND app.user_can_access_tenant(p_tenant_id)
  ),
  stage_agg AS (
    SELECT si.packageinstance_id AS package_instance_id,
           count(*)::integer AS stages_total,
           count(*) FILTER (WHERE si.status IN ('completed','core_complete','na'))::integer AS stages_complete,
           min(si.stage_sortorder) FILTER (WHERE si.status NOT IN ('completed','core_complete','na')) AS current_stage_sortorder,
           max(si.updated_at) AS stage_last_updated
      FROM public.stage_instances si
      JOIN public.stages s ON s.id = si.stage_id
     WHERE si.packageinstance_id IN (SELECT id FROM allowed_packages)
       AND COALESCE(s.is_audit_workspace, false) = false
       AND COALESCE(s.is_archived, false) = false
     GROUP BY si.packageinstance_id
  ),
  current_stage AS (
    SELECT DISTINCT ON (si.packageinstance_id) si.packageinstance_id,
           COALESCE(NULLIF(TRIM(BOTH FROM s.shortname), ''), s.name) AS shortname
      FROM public.stage_instances si
      JOIN public.stages s ON s.id = si.stage_id
     WHERE si.packageinstance_id IN (SELECT id FROM allowed_packages)
       AND si.status NOT IN ('completed','core_complete','na')
       AND COALESCE(s.is_archived, false) = false
       AND COALESCE(s.is_audit_workspace, false) = false
     ORDER BY si.packageinstance_id, si.stage_sortorder
  ),
  action_items_agg AS (
    SELECT cai.package_instance_id,
           count(*)::integer AS open_count,
           count(*) FILTER (WHERE cai.due_date < now()::date)::integer AS overdue_count,
           max(cai.updated_at) AS last_updated
      FROM public.client_action_items cai
     WHERE cai.package_instance_id IN (SELECT id FROM allowed_packages)
       AND cai.completed_at IS NULL
       AND COALESCE(cai.status,'open') <> ALL (ARRAY['completed','cancelled'])
     GROUP BY cai.package_instance_id
  ),
  tasks_agg AS (
    SELECT a.package_instance_id,
           COALESCE(a.open_count,0)    AS open_tasks,
           COALESCE(a.overdue_count,0) AS overdue_tasks,
           a.last_updated              AS tasks_last_updated
      FROM action_items_agg a
  ),
  notes_agg AS (
    SELECT n.parent_id AS package_instance_id,
           max(n.updated_at) AS notes_last_updated
      FROM public.notes n
     WHERE n.parent_type = 'package_instance'
       AND n.parent_id IS NOT NULL
       AND n.tenant_id = p_tenant_id
     GROUP BY n.parent_id
  ),
  pinned AS (
    SELECT DISTINCT ON (n.parent_id) n.parent_id AS package_instance_id,
           n.title         AS pinned_note_title,
           n.note_details  AS pinned_note_text,
           n.priority      AS pinned_note_priority,
           n.updated_at    AS pinned_note_updated_at
      FROM public.notes n
     WHERE n.parent_type = 'package_instance'
       AND n.is_pinned = true
       AND n.parent_id IS NOT NULL
       AND n.tenant_id = p_tenant_id
     ORDER BY n.parent_id, n.updated_at DESC NULLS LAST
  ),
  hours_agg AS (
    SELECT te.package_instance_id,
           COALESCE(sum(te.duration_minutes),0::bigint)::numeric / 60.0 AS hours_used_calc,
           max(te.start_at) AS max_te_at
      FROM public.time_entries te
      JOIN allowed_packages ap ON ap.id = te.package_instance_id
     WHERE te.duration_minutes IS NOT NULL
       AND te.duration_minutes > 0
       AND (ap.start_date IS NULL OR te.start_at >= ap.start_date)
       AND te.is_billable = true
     GROUP BY te.package_instance_id
  ),
  most_recent_activity AS (
    SELECT pi.id AS package_instance_id,
           COALESCE(GREATEST(na.notes_last_updated, sa.stage_last_updated,
                             ta.tasks_last_updated, ha.max_te_at),
                    pi.start_date::timestamptz) AS last_activity_at
      FROM allowed_packages pi
      LEFT JOIN notes_agg na ON na.package_instance_id = pi.id
      LEFT JOIN stage_agg sa ON sa.package_instance_id = pi.id
      LEFT JOIN tasks_agg ta ON ta.package_instance_id = pi.id
      LEFT JOIN hours_agg ha ON ha.package_instance_id = pi.id
  )
  SELECT pi.id AS package_instance_id,
         pi.tenant_id,
         COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''), p.name) AS package_name,
         p.package_type, p.progress_mode, pi.manager_id, pi.is_complete,
         pi.start_date, pi.end_date,
         COALESCE(pi.hours_included,0) AS hours_included,
         COALESCE(pi.hours_added,0)    AS hours_added,
         (COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0))::numeric AS hours_total,
         COALESCE(ha.hours_used_calc,0::numeric) AS hours_used,
         GREATEST((COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0))::numeric
                  - COALESCE(ha.hours_used_calc,0::numeric), 0::numeric) AS hours_remaining,
         CASE WHEN (COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0)) = 0 THEN 0::numeric
              ELSE round(COALESCE(ha.hours_used_calc,0::numeric)
                         / (COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0))::numeric, 4)
         END AS hours_pct_used,
         COALESCE(sa.stages_total,0)    AS stages_total,
         COALESCE(sa.stages_complete,0) AS stages_complete,
         sa.current_stage_sortorder,
         COALESCE(ta.open_tasks,0)    AS open_tasks,
         COALESCE(ta.overdue_tasks,0) AS overdue_tasks,
         mra.last_activity_at,
         pn.pinned_note_title, pn.pinned_note_text,
         pn.pinned_note_priority, pn.pinned_note_updated_at,
         CASE
           WHEN pn.pinned_note_text IS NULL AND pn.pinned_note_title IS NULL THEN NULL
           WHEN lower((COALESCE(pn.pinned_note_text,'')||' ')||COALESCE(pn.pinned_note_title,'')) LIKE '%on hold%' THEN 'hold'
           WHEN lower((COALESCE(pn.pinned_note_text,'')||' ')||COALESCE(pn.pinned_note_title,'')) ~ '(urgent|overdue)' THEN 'urgent'
           ELSE 'info'
         END AS pinned_note_severity,
         CASE
           WHEN pn.pinned_note_text IS NOT NULL
                AND lower((COALESCE(pn.pinned_note_text,'')||' ')||COALESCE(pn.pinned_note_title,'')) LIKE '%on hold%' THEN 'on_hold'
           WHEN pi.is_complete = true THEN 'complete'
           WHEN mra.last_activity_at < (now() - interval '30 days')
                OR ((COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0)) > 0
                    AND (COALESCE(ha.hours_used_calc,0::numeric)
                         / (COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0))::numeric) >= 0.95) THEN 'stuck'
           WHEN mra.last_activity_at < (now() - interval '14 days')
                OR ((COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0)) > 0
                    AND (COALESCE(ha.hours_used_calc,0::numeric)
                         / (COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0))::numeric) >= 0.75)
                OR COALESCE(ta.overdue_tasks,0) > 0 THEN 'drifting'
           ELSE 'on_track'
         END AS status_pill,
         cs.shortname AS current_stage_shortname
    FROM allowed_packages pi
    JOIN public.packages p              ON p.id = pi.package_id
    LEFT JOIN stage_agg sa              ON sa.package_instance_id = pi.id
    LEFT JOIN current_stage cs          ON cs.packageinstance_id = pi.id
    LEFT JOIN tasks_agg ta              ON ta.package_instance_id = pi.id
    LEFT JOIN notes_agg na              ON na.package_instance_id = pi.id
    LEFT JOIN pinned pn                 ON pn.package_instance_id = pi.id
    LEFT JOIN hours_agg ha              ON ha.package_instance_id = pi.id
    LEFT JOIN most_recent_activity mra  ON mra.package_instance_id = pi.id
$function$;

REVOKE ALL ON FUNCTION public.get_client_package_dashboard(bigint, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_client_package_dashboard(bigint, bigint) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_client_package_dashboard(bigint, bigint) TO authenticated, service_role;


-- 8) fn_check_phase_gate(uuid) — not-blocking set; tightened search_path
CREATE OR REPLACE FUNCTION public.fn_check_phase_gate(p_phase_instance_id uuid)
RETURNS TABLE(is_passable boolean, gate_type text, missing_stages text[])
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    CASE
      WHEN COUNT(ps.id) FILTER (WHERE ps.is_required) = 0 THEN true
      WHEN COUNT(si.id) FILTER (
             WHERE ps.is_required
               AND si.status IN ('completed','core_complete','na')
           ) >= COUNT(ps.id) FILTER (WHERE ps.is_required) THEN true
      ELSE false
    END AS is_passable,
    phi.gate_type,
    ARRAY_AGG(ds.title) FILTER (
      WHERE ps.is_required
        AND (si.id IS NULL OR si.status NOT IN ('completed','core_complete','na'))
    ) AS missing_stages
  FROM public.phase_instances phi
  JOIN public.phase_stages ps ON ps.phase_id = phi.phase_id
  JOIN public.documents_stages ds ON ds.id = ps.stage_id
  LEFT JOIN public.stage_instances si
    ON si.stage_id = ps.stage_id
   AND si.packageinstance_id = phi.package_instance_id
  WHERE phi.id = p_phase_instance_id
    AND ps.package_id = (
      SELECT pin.package_id FROM public.package_instances pin
      WHERE pin.id = phi.package_instance_id
    )
  GROUP BY phi.gate_type;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_check_phase_gate(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_check_phase_gate(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.fn_check_phase_gate(uuid) TO authenticated, service_role;


-- 9) fn_close_phase_instance(uuid, text, text, text) — not-blocking set; tightened search_path
CREATE OR REPLACE FUNCTION public.fn_close_phase_instance(
  p_phase_instance_id uuid,
  p_status text,
  p_note text DEFAULT NULL,
  p_exception_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid;
  v_missing integer;
BEGIN
  v_user_id := auth.uid();
  IF NOT public.is_vivacity_team_safe(v_user_id) THEN
    RAISE EXCEPTION 'Unauthorised: Vivacity staff only';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.dd_phase_status WHERE value = p_status) THEN
    RAISE EXCEPTION 'Invalid phase status: %', p_status;
  END IF;

  IF p_status = 'completed' THEN
    SELECT COUNT(*) INTO v_missing
    FROM public.phase_stages ps
    JOIN public.phase_instances phi ON phi.phase_id = ps.phase_id
    WHERE phi.id = p_phase_instance_id
      AND ps.is_required = true
      AND ps.package_id = (
        SELECT pin.package_id FROM public.package_instances pin
        WHERE pin.id = phi.package_instance_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.stage_instances si
        WHERE si.stage_id = ps.stage_id
          AND si.packageinstance_id = phi.package_instance_id
          AND si.status IN ('completed','core_complete','na')
      );

    IF v_missing > 0 THEN
      RAISE EXCEPTION 'Cannot complete: % required stage(s) not finished', v_missing;
    END IF;
  END IF;

  IF p_status = 'completed_with_exceptions'
     AND (p_exception_reason IS NULL OR p_exception_reason = '') THEN
    RAISE EXCEPTION 'Exception reason required for completed_with_exceptions';
  END IF;

  UPDATE public.phase_instances
  SET status = p_status,
      notes = COALESCE(p_note, notes),
      exception_reason = CASE WHEN p_status = 'completed_with_exceptions' THEN p_exception_reason ELSE exception_reason END,
      completed_at = CASE WHEN p_status IN ('completed','completed_with_exceptions') THEN now() ELSE completed_at END,
      closed_by    = CASE WHEN p_status IN ('completed','completed_with_exceptions') THEN v_user_id ELSE closed_by END,
      updated_at = now()
  WHERE id = p_phase_instance_id;

  INSERT INTO public.audit_events (entity, entity_id, action, user_id, details)
  VALUES (
    'phase_instances',
    p_phase_instance_id,
    'close_phase',
    v_user_id,
    jsonb_build_object('status', p_status, 'note', p_note, 'exception_reason', p_exception_reason)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_close_phase_instance(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_close_phase_instance(uuid, text, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.fn_close_phase_instance(uuid, text, text, text) TO authenticated, service_role;


-- Reload PostgREST schema cache
SELECT pg_notify('pgrst', 'reload schema');