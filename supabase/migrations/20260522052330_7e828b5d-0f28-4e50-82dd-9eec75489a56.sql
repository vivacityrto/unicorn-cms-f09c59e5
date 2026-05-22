CREATE OR REPLACE FUNCTION public.get_client_package_dashboard(p_tenant_id bigint, p_package_instance_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(package_instance_id bigint, tenant_id bigint, package_name text, package_type text, progress_mode text, manager_id uuid, is_complete boolean, start_date date, end_date date, hours_included integer, hours_added integer, hours_total numeric, hours_used numeric, hours_remaining numeric, hours_pct_used numeric, stages_total integer, stages_complete integer, current_stage_sortorder integer, open_tasks integer, overdue_tasks integer, last_activity_at timestamp with time zone, pinned_note_title text, pinned_note_text text, pinned_note_priority text, pinned_note_updated_at timestamp with time zone, pinned_note_severity text, status_pill text, current_stage_shortname text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'app'
 SET row_security TO 'off'
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
           count(*) FILTER (
             WHERE si.status_id = ANY (ARRAY[2, 3])
                OR si.status_id = 4
                OR (si.status_id = 1 AND si.status = '4')
           )::integer AS stages_complete,
           min(si.stage_sortorder) FILTER (
             WHERE NOT (
                  si.status_id = ANY (ARRAY[2, 3])
               OR si.status_id = 4
               OR (si.status_id = 1 AND si.status = '4')
             )
           ) AS current_stage_sortorder,
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
       AND NOT (
            si.status_id = ANY (ARRAY[2, 3])
         OR si.status_id = 4
         OR (si.status_id = 1 AND si.status = '4')
       )
       AND COALESCE(s.is_archived, false) = false
       AND COALESCE(s.is_audit_workspace, false) = false
     ORDER BY si.packageinstance_id, si.stage_sortorder
  ),
  action_items_agg AS (
    SELECT cai.package_id AS package_instance_id,
           count(*)::integer AS open_count,
           count(*) FILTER (WHERE cai.due_date < now()::date)::integer AS overdue_count,
           max(cai.updated_at) AS last_updated
      FROM public.client_action_items cai
     WHERE cai.package_id IN (SELECT id FROM allowed_packages)
       AND cai.completed_at IS NULL
       AND (COALESCE(cai.status, 'open') <> ALL (ARRAY['completed','cancelled']))
     GROUP BY cai.package_id
  ),
  task_instances_agg AS (
    SELECT si.packageinstance_id AS package_instance_id,
           count(*)::integer AS open_count,
           count(*) FILTER (WHERE cti.due_date < now())::integer AS overdue_count,
           max(cti.updated_at) AS last_updated
      FROM public.client_task_instances cti
      JOIN public.stage_instances si ON si.id = cti.stageinstance_id
     WHERE si.packageinstance_id IN (SELECT id FROM allowed_packages)
       AND COALESCE(cti.is_archived, false) = false
       AND cti.completion_date IS NULL
       AND COALESCE(cti.status, 0) <> 2
       AND COALESCE(si.released_client_tasks, false) = true
     GROUP BY si.packageinstance_id
  ),
  tasks_agg AS (
    SELECT COALESCE(a.package_instance_id, t.package_instance_id) AS package_instance_id,
           COALESCE(a.open_count, 0) + COALESCE(t.open_count, 0)       AS open_tasks,
           COALESCE(a.overdue_count, 0) + COALESCE(t.overdue_count, 0) AS overdue_tasks,
           GREATEST(a.last_updated, t.last_updated)                    AS tasks_last_updated
      FROM action_items_agg a
      FULL JOIN task_instances_agg t ON t.package_instance_id = a.package_instance_id
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
           COALESCE(sum(te.duration_minutes), 0::bigint)::numeric / 60.0 AS hours_used_calc,
           max(te.start_at) AS max_te_at
      FROM public.time_entries te
      JOIN allowed_packages ap ON ap.id = te.package_instance_id
     WHERE te.duration_minutes IS NOT NULL
       AND te.duration_minutes > 0
       AND (ap.start_date IS NULL OR te.start_at >= ap.start_date)
     GROUP BY te.package_instance_id
  ),
  most_recent_activity AS (
    SELECT pi.id AS package_instance_id,
           COALESCE(
             GREATEST(na.notes_last_updated, sa.stage_last_updated, ta.tasks_last_updated, ha.max_te_at),
             pi.start_date::timestamptz
           ) AS last_activity_at
      FROM allowed_packages pi
      LEFT JOIN notes_agg na ON na.package_instance_id = pi.id
      LEFT JOIN stage_agg sa ON sa.package_instance_id = pi.id
      LEFT JOIN tasks_agg ta ON ta.package_instance_id = pi.id
      LEFT JOIN hours_agg ha ON ha.package_instance_id = pi.id
  )
  SELECT pi.id AS package_instance_id,
         pi.tenant_id,
         COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''), p.name) AS package_name,
         p.package_type,
         p.progress_mode,
         pi.manager_id,
         pi.is_complete,
         pi.start_date,
         pi.end_date,
         COALESCE(pi.hours_included, 0) AS hours_included,
         COALESCE(pi.hours_added, 0)    AS hours_added,
         (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0))::numeric AS hours_total,
         COALESCE(ha.hours_used_calc, 0::numeric) AS hours_used,
         GREATEST((COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0))::numeric
                  - COALESCE(ha.hours_used_calc, 0::numeric), 0::numeric) AS hours_remaining,
         CASE
           WHEN (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0)) = 0 THEN 0::numeric
           ELSE round(COALESCE(ha.hours_used_calc, 0::numeric)
                      / (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0))::numeric, 4)
         END AS hours_pct_used,
         COALESCE(sa.stages_total, 0)    AS stages_total,
         COALESCE(sa.stages_complete, 0) AS stages_complete,
         sa.current_stage_sortorder,
         COALESCE(ta.open_tasks, 0)    AS open_tasks,
         COALESCE(ta.overdue_tasks, 0) AS overdue_tasks,
         mra.last_activity_at,
         pn.pinned_note_title,
         pn.pinned_note_text,
         pn.pinned_note_priority,
         pn.pinned_note_updated_at,
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
                OR ((COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0)) > 0
                    AND (COALESCE(ha.hours_used_calc, 0::numeric)
                         / (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0))::numeric) >= 0.95) THEN 'stuck'
           WHEN mra.last_activity_at < (now() - interval '14 days')
                OR ((COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0)) > 0
                    AND (COALESCE(ha.hours_used_calc, 0::numeric)
                         / (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0))::numeric) >= 0.75)
                OR COALESCE(ta.overdue_tasks, 0) > 0 THEN 'drifting'
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
    LEFT JOIN most_recent_activity mra  ON mra.package_instance_id = pi.id;
$function$;