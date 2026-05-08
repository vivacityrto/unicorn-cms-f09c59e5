SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';

CREATE OR REPLACE VIEW public.v_client_package_dashboard
WITH (security_invoker = on) AS
WITH stage_agg AS (
  SELECT si.packageinstance_id AS package_instance_id,
         count(*)::integer AS stages_total,
         count(*) FILTER (WHERE si.status_id = ANY (ARRAY[2, 3]))::integer AS stages_complete,
         min(si.stage_sortorder) FILTER (WHERE si.status_id IS NULL OR (si.status_id <> ALL (ARRAY[2, 3]))) AS current_stage_sortorder,
         max(si.updated_at) AS stage_last_updated
    FROM stage_instances si
    JOIN package_instances pi ON pi.id = si.packageinstance_id
   WHERE app.user_can_access_tenant(pi.tenant_id)
   GROUP BY si.packageinstance_id
), current_stage AS (
  SELECT DISTINCT ON (si.packageinstance_id) si.packageinstance_id,
         COALESCE(NULLIF(TRIM(BOTH FROM s.shortname), ''::text), s.name) AS shortname
    FROM stage_instances si
    JOIN stages s ON s.id = si.stage_id
    JOIN package_instances pi ON pi.id = si.packageinstance_id
   WHERE (si.status_id IS NULL OR (si.status_id <> ALL (ARRAY[2, 3])))
     AND COALESCE(s.is_archived, false) = false
     AND COALESCE(s.is_audit_workspace, false) = false
     AND app.user_can_access_tenant(pi.tenant_id)
   ORDER BY si.packageinstance_id, si.stage_sortorder
), action_items_agg AS (
  SELECT cai.package_id AS package_instance_id,
         count(*)::integer AS open_count,
         count(*) FILTER (WHERE cai.due_date < now()::date)::integer AS overdue_count,
         max(cai.updated_at) AS last_updated
    FROM client_action_items cai
   WHERE cai.package_id IS NOT NULL
     AND cai.completed_at IS NULL
     AND (COALESCE(cai.status, 'open'::text) <> ALL (ARRAY['completed'::text, 'cancelled'::text]))
     AND app.user_can_access_tenant(cai.tenant_id)
   GROUP BY cai.package_id
), task_instances_agg AS (
  SELECT si.packageinstance_id AS package_instance_id,
         count(*)::integer AS open_count,
         count(*) FILTER (WHERE cti.due_date < now())::integer AS overdue_count,
         max(cti.updated_at) AS last_updated
    FROM client_task_instances cti
    JOIN stage_instances si ON si.id = cti.stageinstance_id
    JOIN package_instances pi ON pi.id = si.packageinstance_id
   WHERE COALESCE(cti.is_archived, false) = false
     AND cti.completion_date IS NULL
     AND COALESCE(cti.status, 0) <> 2
     AND COALESCE(si.released_client_tasks, false) = true
     AND app.user_can_access_tenant(pi.tenant_id)
   GROUP BY si.packageinstance_id
), tasks_agg AS (
  SELECT COALESCE(a.package_instance_id, t.package_instance_id) AS package_instance_id,
         COALESCE(a.open_count, 0) + COALESCE(t.open_count, 0) AS open_tasks,
         COALESCE(a.overdue_count, 0) + COALESCE(t.overdue_count, 0) AS overdue_tasks,
         GREATEST(a.last_updated, t.last_updated) AS tasks_last_updated
    FROM action_items_agg a
    FULL JOIN task_instances_agg t ON t.package_instance_id = a.package_instance_id
), notes_agg AS (
  SELECT n.parent_id AS package_instance_id,
         max(n.updated_at) AS notes_last_updated
    FROM notes n
   WHERE n.parent_type = 'package_instance'::text
     AND n.parent_id IS NOT NULL
     AND app.user_can_access_tenant(n.tenant_id)
   GROUP BY n.parent_id
), pinned AS (
  SELECT DISTINCT ON (n.parent_id) n.parent_id AS package_instance_id,
         n.title AS pinned_note_title,
         n.note_details AS pinned_note_text,
         n.priority AS pinned_note_priority,
         n.updated_at AS pinned_note_updated_at
    FROM notes n
   WHERE n.parent_type = 'package_instance'::text
     AND n.is_pinned = true
     AND n.parent_id IS NOT NULL
     AND app.user_can_access_tenant(n.tenant_id)
   ORDER BY n.parent_id, n.updated_at DESC NULLS LAST
), hours_agg AS (
  SELECT te.package_instance_id,
         COALESCE(sum(te.duration_minutes), 0::bigint)::numeric / 60.0 AS hours_used_calc,
         max(te.start_at) AS max_te_at
    FROM time_entries te
    JOIN package_instances pi2 ON pi2.id = te.package_instance_id
   WHERE te.package_instance_id IS NOT NULL
     AND te.duration_minutes IS NOT NULL
     AND te.duration_minutes > 0
     AND (pi2.start_date IS NULL OR te.start_at >= pi2.start_date)
     AND app.user_can_access_tenant(pi2.tenant_id)
   GROUP BY te.package_instance_id
), most_recent_activity AS (
  SELECT pi_1.id AS package_instance_id,
         COALESCE(GREATEST(na_1.notes_last_updated, sa_1.stage_last_updated, ta_1.tasks_last_updated, ha_1.max_te_at), pi_1.start_date::timestamp with time zone) AS last_activity_at
    FROM package_instances pi_1
    LEFT JOIN notes_agg na_1 ON na_1.package_instance_id = pi_1.id
    LEFT JOIN stage_agg sa_1 ON sa_1.package_instance_id = pi_1.id
    LEFT JOIN tasks_agg ta_1 ON ta_1.package_instance_id = pi_1.id
    LEFT JOIN hours_agg ha_1 ON ha_1.package_instance_id = pi_1.id
)
SELECT pi.id AS package_instance_id,
       pi.tenant_id,
       COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''::text), p.name) AS package_name,
       p.package_type,
       p.progress_mode,
       pi.manager_id,
       pi.is_complete,
       pi.start_date,
       pi.end_date,
       COALESCE(pi.hours_included, 0) AS hours_included,
       COALESCE(pi.hours_added, 0) AS hours_added,
       (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0))::numeric AS hours_total,
       COALESCE(ha.hours_used_calc, 0::numeric) AS hours_used,
       GREATEST((COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0))::numeric - COALESCE(ha.hours_used_calc, 0::numeric), 0::numeric) AS hours_remaining,
       CASE
           WHEN (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0)) = 0 THEN 0::numeric
           ELSE round(COALESCE(ha.hours_used_calc, 0::numeric) / (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0))::numeric, 4)
       END AS hours_pct_used,
       COALESCE(sa.stages_total, 0) AS stages_total,
       COALESCE(sa.stages_complete, 0) AS stages_complete,
       sa.current_stage_sortorder,
       COALESCE(ta.open_tasks, 0) AS open_tasks,
       COALESCE(ta.overdue_tasks, 0) AS overdue_tasks,
       mra.last_activity_at,
       pn.pinned_note_title,
       pn.pinned_note_text,
       pn.pinned_note_priority,
       pn.pinned_note_updated_at,
       CASE
           WHEN pn.pinned_note_text IS NULL AND pn.pinned_note_title IS NULL THEN NULL::text
           WHEN lower((COALESCE(pn.pinned_note_text, ''::text) || ' '::text) || COALESCE(pn.pinned_note_title, ''::text)) ~~ '%on hold%'::text THEN 'hold'::text
           WHEN lower((COALESCE(pn.pinned_note_text, ''::text) || ' '::text) || COALESCE(pn.pinned_note_title, ''::text)) ~ '(urgent|overdue)'::text THEN 'urgent'::text
           ELSE 'info'::text
       END AS pinned_note_severity,
       CASE
           WHEN pn.pinned_note_text IS NOT NULL AND lower((COALESCE(pn.pinned_note_text, ''::text) || ' '::text) || COALESCE(pn.pinned_note_title, ''::text)) ~~ '%on hold%'::text THEN 'on_hold'::text
           WHEN pi.is_complete = true THEN 'complete'::text
           WHEN mra.last_activity_at < (now() - '30 days'::interval) OR (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0)) > 0 AND (COALESCE(ha.hours_used_calc, 0::numeric) / (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0))::numeric) >= 0.95 THEN 'stuck'::text
           WHEN mra.last_activity_at < (now() - '14 days'::interval) OR (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0)) > 0 AND (COALESCE(ha.hours_used_calc, 0::numeric) / (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0))::numeric) >= 0.75 OR COALESCE(ta.overdue_tasks, 0) > 0 THEN 'drifting'::text
           ELSE 'on_track'::text
       END AS status_pill,
       cs.shortname AS current_stage_shortname
  FROM package_instances pi
  JOIN packages p ON p.id = pi.package_id
  LEFT JOIN stage_agg sa ON sa.package_instance_id = pi.id
  LEFT JOIN current_stage cs ON cs.packageinstance_id = pi.id
  LEFT JOIN tasks_agg ta ON ta.package_instance_id = pi.id
  LEFT JOIN notes_agg na ON na.package_instance_id = pi.id
  LEFT JOIN pinned pn ON pn.package_instance_id = pi.id
  LEFT JOIN hours_agg ha ON ha.package_instance_id = pi.id
  LEFT JOIN most_recent_activity mra ON mra.package_instance_id = pi.id;

GRANT SELECT ON public.v_client_package_dashboard TO authenticated;