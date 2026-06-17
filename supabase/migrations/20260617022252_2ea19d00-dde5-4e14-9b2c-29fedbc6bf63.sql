-- =====================================================================
-- Phase 7 — drop deprecated released_client_tasks columns
--
-- Pre-deploy verification (must return 0):
--   SELECT count(*) FROM public.client_task_instances cti
--   JOIN public.stage_instances si ON si.id = cti.stageinstance_id
--   WHERE COALESCE(si.released_client_tasks,false)=true
--     AND cti.published_action_item_id IS NULL
--     AND COALESCE(cti.is_archived,false)=false;
-- =====================================================================

-- 1. v_client_package_dashboard (output unchanged) --------------------
CREATE OR REPLACE VIEW public.v_client_package_dashboard AS
WITH stage_agg AS (
         SELECT si.packageinstance_id AS package_instance_id,
            count(*)::integer AS stages_total,
            count(*) FILTER (WHERE si.status_id = ANY (ARRAY[2, 3]))::integer AS stages_complete,
            min(si.stage_sortorder) FILTER (WHERE si.status_id IS NULL OR (si.status_id <> ALL (ARRAY[2, 3]))) AS current_stage_sortorder,
            max(si.updated_at) AS stage_last_updated
           FROM public.stage_instances si
             JOIN public.package_instances pi_1 ON pi_1.id = si.packageinstance_id
          WHERE app.user_can_access_tenant(pi_1.tenant_id)
          GROUP BY si.packageinstance_id
        ), current_stage AS (
         SELECT DISTINCT ON (si.packageinstance_id) si.packageinstance_id,
            COALESCE(NULLIF(TRIM(BOTH FROM s.shortname), ''::text), s.name) AS shortname
           FROM public.stage_instances si
             JOIN public.stages s ON s.id = si.stage_id
             JOIN public.package_instances pi_1 ON pi_1.id = si.packageinstance_id
          WHERE (si.status_id IS NULL OR (si.status_id <> ALL (ARRAY[2, 3]))) AND COALESCE(s.is_archived, false) = false AND COALESCE(s.is_audit_workspace, false) = false AND app.user_can_access_tenant(pi_1.tenant_id)
          ORDER BY si.packageinstance_id, si.stage_sortorder
        ), action_items_agg AS (
         SELECT cai.package_instance_id,
            count(*)::integer AS open_count,
            count(*) FILTER (WHERE cai.due_date < now()::date)::integer AS overdue_count,
            max(cai.updated_at) AS last_updated
           FROM public.client_action_items cai
          WHERE cai.package_instance_id IS NOT NULL AND cai.completed_at IS NULL AND (COALESCE(cai.status, 'open'::text) <> ALL (ARRAY['completed'::text, 'cancelled'::text])) AND app.user_can_access_tenant(cai.tenant_id::bigint)
          GROUP BY cai.package_instance_id
        ), tasks_agg AS (
         SELECT a.package_instance_id,
            COALESCE(a.open_count, 0) AS open_tasks,
            COALESCE(a.overdue_count, 0) AS overdue_tasks,
            a.last_updated AS tasks_last_updated
           FROM action_items_agg a
        ), notes_agg AS (
         SELECT n.parent_id AS package_instance_id,
            max(n.updated_at) AS notes_last_updated
           FROM public.notes n
          WHERE n.parent_type = 'package_instance'::text AND n.parent_id IS NOT NULL AND app.user_can_access_tenant(n.tenant_id)
          GROUP BY n.parent_id
        ), pinned AS (
         SELECT DISTINCT ON (n.parent_id) n.parent_id AS package_instance_id,
            n.title AS pinned_note_title,
            n.note_details AS pinned_note_text,
            n.priority AS pinned_note_priority,
            n.updated_at AS pinned_note_updated_at
           FROM public.notes n
          WHERE n.parent_type = 'package_instance'::text AND n.is_pinned = true AND n.parent_id IS NOT NULL AND app.user_can_access_tenant(n.tenant_id)
          ORDER BY n.parent_id, n.updated_at DESC NULLS LAST
        ), hours_agg AS (
         SELECT te.package_instance_id,
            COALESCE(sum(te.duration_minutes), 0::bigint)::numeric / 60.0 AS hours_used_calc,
            max(te.start_at) AS max_te_at
           FROM public.time_entries te
             JOIN public.package_instances pi2 ON pi2.id = te.package_instance_id
          WHERE te.package_instance_id IS NOT NULL AND te.duration_minutes IS NOT NULL AND te.duration_minutes > 0 AND (pi2.start_date IS NULL OR te.start_at >= pi2.start_date) AND app.user_can_access_tenant(pi2.tenant_id) AND te.is_billable = true
          GROUP BY te.package_instance_id
        ), most_recent_activity AS (
         SELECT pi_1.id AS package_instance_id,
            COALESCE(GREATEST(na_1.notes_last_updated, sa_1.stage_last_updated, ta_1.tasks_last_updated, ha_1.max_te_at), pi_1.start_date::timestamp with time zone) AS last_activity_at
           FROM public.package_instances pi_1
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
   FROM public.package_instances pi
     JOIN public.packages p ON p.id = pi.package_id
     LEFT JOIN stage_agg sa ON sa.package_instance_id = pi.id
     LEFT JOIN current_stage cs ON cs.packageinstance_id = pi.id
     LEFT JOIN tasks_agg ta ON ta.package_instance_id = pi.id
     LEFT JOIN notes_agg na ON na.package_instance_id = pi.id
     LEFT JOIN pinned pn ON pn.package_instance_id = pi.id
     LEFT JOIN hours_agg ha ON ha.package_instance_id = pi.id
     LEFT JOIN most_recent_activity mra ON mra.package_instance_id = pi.id;

-- 2. v_client_package_whats_next (output unchanged) -------------------
CREATE OR REPLACE VIEW public.v_client_package_whats_next AS
WITH combined AS (
         SELECT cai.package_instance_id,
            cai.tenant_id::bigint AS tenant_id,
            cai.id::text AS task_uid,
            'action_item'::text AS source,
            cai.title,
            cai.description,
            cai.due_date::timestamp with time zone AS due_at,
            cai.priority,
            cai.created_at,
            cai.updated_at,
            cai.recurrence_rule,
            cai.item_type
           FROM public.client_action_items cai
          WHERE cai.completed_at IS NULL AND (cai.status IS NULL OR (cai.status <> ALL (ARRAY['completed'::text, 'cancelled'::text])))
        ), ranked AS (
         SELECT c.package_instance_id,
            c.tenant_id,
            c.task_uid,
            c.source,
            c.title,
            c.description,
            c.due_at,
            c.priority,
            c.created_at,
            c.updated_at,
            c.recurrence_rule,
            c.item_type,
                CASE
                    WHEN c.due_at IS NOT NULL AND c.due_at < now() THEN 'overdue'::text
                    WHEN c.due_at IS NOT NULL AND c.due_at < (now() + '7 days'::interval) THEN 'due_soon'::text
                    WHEN c.item_type ~~* 'recurring%'::text OR c.recurrence_rule IS NOT NULL THEN 'recurring'::text
                    WHEN c.due_at IS NOT NULL THEN 'upcoming'::text
                    ELSE 'untimed'::text
                END AS urgency,
                CASE
                    WHEN c.due_at IS NOT NULL AND c.due_at < now() THEN 1
                    WHEN c.due_at IS NOT NULL AND c.due_at < (now() + '7 days'::interval) THEN 2
                    WHEN c.due_at IS NOT NULL THEN 3
                    WHEN c.item_type ~~* 'recurring%'::text OR c.recurrence_rule IS NOT NULL THEN 4
                    ELSE 5
                END AS urgency_rank,
            row_number() OVER (PARTITION BY c.package_instance_id ORDER BY (
                CASE
                    WHEN c.due_at IS NOT NULL AND c.due_at < now() THEN 1
                    WHEN c.due_at IS NOT NULL AND c.due_at < (now() + '7 days'::interval) THEN 2
                    WHEN c.due_at IS NOT NULL THEN 3
                    WHEN c.item_type ~~* 'recurring%'::text OR c.recurrence_rule IS NOT NULL THEN 4
                    ELSE 5
                END), (COALESCE(c.due_at, 'infinity'::timestamp with time zone)), c.created_at) AS rn
           FROM combined c
        )
 SELECT ranked.package_instance_id,
    ranked.tenant_id,
    ranked.task_uid,
    ranked.source,
    ranked.title,
    ranked.description,
    ranked.due_at,
    ranked.priority,
    ranked.urgency,
    ranked.urgency_rank,
    ranked.rn AS rank_in_package,
    ranked.created_at,
    ranked.updated_at
   FROM ranked
  WHERE ranked.rn <= 3;

-- 3. get_client_package_dashboard() -----------------------------------
CREATE OR REPLACE FUNCTION public.get_client_package_dashboard(p_tenant_id bigint, p_package_instance_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(package_instance_id bigint, tenant_id bigint, package_name text, package_type text, progress_mode text, manager_id uuid, is_complete boolean, start_date date, end_date date, hours_included integer, hours_added integer, hours_total numeric, hours_used numeric, hours_remaining numeric, hours_pct_used numeric, stages_total integer, stages_complete integer, current_stage_sortorder integer, open_tasks integer, overdue_tasks integer, last_activity_at timestamp with time zone, pinned_note_title text, pinned_note_text text, pinned_note_priority text, pinned_note_updated_at timestamp with time zone, pinned_note_severity text, status_pill text, current_stage_shortname text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
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
    SELECT cai.package_instance_id AS package_instance_id,
           count(*)::integer AS open_count,
           count(*) FILTER (WHERE cai.due_date < now()::date)::integer AS overdue_count,
           max(cai.updated_at) AS last_updated
      FROM public.client_action_items cai
     WHERE cai.package_instance_id IN (SELECT id FROM allowed_packages)
       AND cai.completed_at IS NULL
       AND (COALESCE(cai.status, 'open') <> ALL (ARRAY['completed','cancelled']))
     GROUP BY cai.package_instance_id
  ),
  tasks_agg AS (
    SELECT a.package_instance_id,
           COALESCE(a.open_count, 0)    AS open_tasks,
           COALESCE(a.overdue_count, 0) AS overdue_tasks,
           a.last_updated               AS tasks_last_updated
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
           COALESCE(sum(te.duration_minutes), 0::bigint)::numeric / 60.0 AS hours_used_calc,
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

-- 4. v_client_package_stages (DROP+CREATE: 2 output cols removed) -----
DROP VIEW IF EXISTS public.v_client_package_stages;
CREATE VIEW public.v_client_package_stages AS
 SELECT pi.id AS package_instance_id,
    pi.tenant_id,
    si.id AS stage_instance_id,
    s.id AS stage_id,
    si.stage_sortorder,
    s.name AS stage_name,
    COALESCE(NULLIF(TRIM(BOTH FROM s.shortname), ''::text), s.name) AS stage_shortname,
    s.description AS stage_description,
    s.is_recurring,
    COALESCE(s.is_audit_workspace, false) AS is_audit_workspace,
    si.completion_date,
    si.status AS raw_status,
    si.event_conducted_date,
    si.updated_at,
        CASE
            WHEN (si.status_id = ANY (ARRAY[2, 3])) OR si.status_id = 4 OR si.status_id = 1 AND si.status = '4'::text THEN 'complete'::text
            WHEN si.id = (( SELECT si2.id
               FROM public.stage_instances si2
                 JOIN public.stages s2 ON s2.id = si2.stage_id
              WHERE si2.packageinstance_id = pi.id AND NOT ((si2.status_id = ANY (ARRAY[2, 3])) OR si2.status_id = 4 OR si2.status_id = 1 AND si2.status = '4'::text) AND COALESCE(s2.is_archived, false) = false AND COALESCE(s2.is_audit_workspace, false) = false
              ORDER BY si2.stage_sortorder
             LIMIT 1)) THEN 'current'::text
            ELSE 'future'::text
        END AS node_state
   FROM public.package_instances pi
     JOIN public.stage_instances si ON si.packageinstance_id = pi.id
     JOIN public.stages s ON s.id = si.stage_id
  WHERE COALESCE(s.is_archived, false) = false AND COALESCE(s.is_audit_workspace, false) = false;

-- 5. v_client_home_feed (output unchanged) ----------------------------
CREATE OR REPLACE VIEW public.v_client_home_feed AS
WITH cai_due_upcoming AS (
         SELECT 'coming_up'::text AS feed_section,
            'task_due'::text AS event_type,
            cai.tenant_id::bigint AS tenant_id,
            cai.package_id AS package_instance_id,
            cai.due_date::timestamp with time zone AS event_at,
            cai.title,
            NULL::text AS subtitle,
            cai.id::text AS event_uid,
            'client_action_items'::text AS source_table,
            '/client/tasks'::text AS href,
            NULL::text AS package_name
           FROM public.client_action_items cai
          WHERE cai.due_date IS NOT NULL AND cai.completed_at IS NULL AND (COALESCE(cai.status, 'open'::text) <> ALL (ARRAY['completed'::text, 'cancelled'::text])) AND cai.due_date >= now()::date AND cai.due_date < (now() + '84 days'::interval)::date
        ), cai_overdue AS (
         SELECT 'needs_attention'::text AS text,
            'task_overdue'::text AS text,
            cai.tenant_id::bigint AS tenant_id,
            cai.package_id,
            cai.due_date::timestamp with time zone AS due_date,
            cai.title,
            'Overdue task'::text AS text,
            cai.id::text AS id,
            'client_action_items'::text AS text,
            '/client/tasks'::text AS text,
            NULL::text AS text
           FROM public.client_action_items cai
          WHERE cai.due_date IS NOT NULL AND cai.completed_at IS NULL AND (COALESCE(cai.status, 'open'::text) <> ALL (ARRAY['completed'::text, 'cancelled'::text])) AND cai.due_date < now()::date
        ), urgent_notes AS (
         SELECT 'needs_attention'::text AS text,
            'urgent_note'::text AS text,
            n.tenant_id,
            n.parent_id,
            n.updated_at,
            COALESCE(n.title, 'Urgent note'::text) AS "coalesce",
            NULL::text AS text,
            n.id::text AS id,
            'notes'::text AS text,
            '/client/packages'::text AS text,
            COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''::text), p.name) AS "coalesce"
           FROM public.notes n
             JOIN public.package_instances pi ON pi.id = n.parent_id
             JOIN public.packages p ON p.id = pi.package_id
          WHERE n.parent_type = 'package_instance'::text AND COALESCE(n.is_pinned, false) = true AND pi.is_complete = false AND lower((COALESCE(n.note_details, ''::text) || ' '::text) || COALESCE(n.title, ''::text)) ~ '(urgent|overdue|action required)'::text
        ), te_recent AS (
         SELECT 'recent_activity'::text AS text,
            'consult_logged'::text AS text,
            pi.tenant_id,
            pi.id,
            te.start_at,
            COALESCE(NULLIF(TRIM(BOTH FROM te.work_type), ''::text), 'Other'::text) AS "coalesce",
            NULLIF(TRIM(BOTH FROM te.work_sub_type), ''::text) AS "nullif",
            te.id::text AS id,
            'time_entries'::text AS text,
            '/client/packages'::text AS text,
            COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''::text), p.name) AS "coalesce"
           FROM public.time_entries te
             JOIN public.package_instances pi ON pi.id = te.package_instance_id
             JOIN public.packages p ON p.id = pi.package_id
          WHERE te.duration_minutes IS NOT NULL AND te.duration_minutes > 0 AND te.start_at >= (now() - '30 days'::interval) AND (pi.start_date IS NULL OR te.start_at >= pi.start_date) AND pi.is_complete = false AND te.is_billable = true
        ), stages_completed_recent AS (
         SELECT 'recent_activity'::text AS text,
            'stage_completed'::text AS text,
            pi.tenant_id,
            pi.id,
            si.status_date,
            COALESCE(NULLIF(TRIM(BOTH FROM s.name), ''::text), s.shortname) AS "coalesce",
            'Stage complete'::text AS text,
            si.id::text AS id,
            'stage_instances'::text AS text,
            '/client/packages'::text AS text,
            COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''::text), p.name) AS "coalesce"
           FROM public.stage_instances si
             JOIN public.package_instances pi ON pi.id = si.packageinstance_id
             JOIN public.packages p ON p.id = pi.package_id
             JOIN public.stages s ON s.id = si.stage_id
          WHERE (si.status_id = ANY (ARRAY[2, 3])) AND si.status_date IS NOT NULL AND si.status_date >= (now() - '30 days'::interval) AND COALESCE(s.is_archived, false) = false AND COALESCE(s.is_audit_workspace, false) = false AND pi.is_complete = false
        ), cai_completed_recent AS (
         SELECT 'recent_activity'::text AS text,
            'task_completed'::text AS text,
            cai.tenant_id::bigint AS tenant_id,
            cai.package_id,
            cai.completed_at,
            cai.title,
            'Task completed'::text AS text,
            cai.id::text AS id,
            'client_action_items'::text AS text,
            '/client/tasks'::text AS text,
            NULL::text AS text
           FROM public.client_action_items cai
          WHERE cai.completed_at IS NOT NULL AND cai.completed_at >= (now() - '30 days'::interval)
        )
 SELECT all_events.feed_section,
    all_events.event_type,
    all_events.tenant_id,
    all_events.package_instance_id,
    all_events.event_at,
    all_events.title,
    all_events.subtitle,
    all_events.event_uid,
    all_events.source_table,
    all_events.href,
    all_events.package_name
   FROM ( SELECT cai_due_upcoming.feed_section,
            cai_due_upcoming.event_type,
            cai_due_upcoming.tenant_id,
            cai_due_upcoming.package_instance_id,
            cai_due_upcoming.event_at,
            cai_due_upcoming.title,
            cai_due_upcoming.subtitle,
            cai_due_upcoming.event_uid,
            cai_due_upcoming.source_table,
            cai_due_upcoming.href,
            cai_due_upcoming.package_name
           FROM cai_due_upcoming
        UNION ALL
         SELECT cai_overdue.text,
            cai_overdue.text_1 AS text,
            cai_overdue.tenant_id,
            cai_overdue.package_id,
            cai_overdue.due_date,
            cai_overdue.title,
            cai_overdue.text_2 AS text,
            cai_overdue.id,
            cai_overdue.text_3 AS text,
            cai_overdue.text_4 AS text,
            cai_overdue.text_5 AS text
           FROM cai_overdue cai_overdue(text, text_1, tenant_id, package_id, due_date, title, text_2, id, text_3, text_4, text_5)
        UNION ALL
         SELECT urgent_notes.text,
            urgent_notes.text_1 AS text,
            urgent_notes.tenant_id,
            urgent_notes.parent_id,
            urgent_notes.updated_at,
            urgent_notes."coalesce",
            urgent_notes.text_2 AS text,
            urgent_notes.id,
            urgent_notes.text_3 AS text,
            urgent_notes.text_4 AS text,
            urgent_notes.coalesce_1 AS "coalesce"
           FROM urgent_notes urgent_notes(text, text_1, tenant_id, parent_id, updated_at, "coalesce", text_2, id, text_3, text_4, coalesce_1)
        UNION ALL
         SELECT te_recent.text,
            te_recent.text_1 AS text,
            te_recent.tenant_id,
            te_recent.id,
            te_recent.start_at,
            te_recent."coalesce",
            te_recent."nullif",
            te_recent.id_1 AS id,
            te_recent.text_2 AS text,
            te_recent.text_3 AS text,
            te_recent.coalesce_1 AS "coalesce"
           FROM te_recent te_recent(text, text_1, tenant_id, id, start_at, "coalesce", "nullif", id_1, text_2, text_3, coalesce_1)
        UNION ALL
         SELECT stages_completed_recent.text,
            stages_completed_recent.text_1 AS text,
            stages_completed_recent.tenant_id,
            stages_completed_recent.id,
            stages_completed_recent.status_date,
            stages_completed_recent."coalesce",
            stages_completed_recent.text_2 AS text,
            stages_completed_recent.id_1 AS id,
            stages_completed_recent.text_3 AS text,
            stages_completed_recent.text_4 AS text,
            stages_completed_recent.coalesce_1 AS "coalesce"
           FROM stages_completed_recent stages_completed_recent(text, text_1, tenant_id, id, status_date, "coalesce", text_2, id_1, text_3, text_4, coalesce_1)
        UNION ALL
         SELECT cai_completed_recent.text,
            cai_completed_recent.text_1 AS text,
            cai_completed_recent.tenant_id,
            cai_completed_recent.package_id,
            cai_completed_recent.completed_at,
            cai_completed_recent.title,
            cai_completed_recent.text_2 AS text,
            cai_completed_recent.id,
            cai_completed_recent.text_3 AS text,
            cai_completed_recent.text_4 AS text,
            cai_completed_recent.text_5 AS text
           FROM cai_completed_recent cai_completed_recent(text, text_1, tenant_id, package_id, completed_at, title, text_2, id, text_3, text_4, text_5)) all_events(feed_section, event_type, tenant_id, package_instance_id, event_at, title, subtitle, event_uid, source_table, href, package_name)
  WHERE all_events.event_at IS NOT NULL;

-- 6. v_admin_zero_progress_packages (DROP+CREATE: stages_released col removed) ---
DROP VIEW IF EXISTS public.v_admin_zero_progress_packages;
CREATE VIEW public.v_admin_zero_progress_packages AS
WITH stage_counts AS (
         SELECT si.packageinstance_id,
            count(*)::integer AS stages_total,
            count(*) FILTER (WHERE si.status_id = ANY (ARRAY[2, 3]))::integer AS stages_complete,
            max(si.updated_at) AS max_stage_updated_at
           FROM public.stage_instances si
          GROUP BY si.packageinstance_id
        ), task_counts AS (
         SELECT cai.package_id AS package_instance_id,
            count(*) AS ai_total,
            count(*) FILTER (WHERE cai.completed_at IS NOT NULL) AS ai_completed,
            max(cai.updated_at) AS max_ai_updated_at
           FROM public.client_action_items cai
          WHERE cai.package_id IS NOT NULL
          GROUP BY cai.package_id
        ), legacy_task_counts AS (
         SELECT si.packageinstance_id AS package_instance_id,
            count(*) AS ti_total,
            count(*) FILTER (WHERE cti.completion_date IS NOT NULL) AS ti_completed,
            count(*) FILTER (WHERE COALESCE(cti.is_archived, false) = false AND cti.completion_date IS NULL) AS ti_open,
            max(cti.updated_at) AS max_ti_updated_at
           FROM public.client_task_instances cti
             JOIN public.stage_instances si ON si.id = cti.stageinstance_id
          GROUP BY si.packageinstance_id
        ), hours AS (
         SELECT te.package_instance_id,
            COALESCE(sum(te.duration_minutes), 0::bigint)::numeric / 60.0 AS hours_logged,
            max(te.start_at) AS max_te_at
           FROM public.time_entries te
          WHERE te.package_instance_id IS NOT NULL AND te.is_billable = true
          GROUP BY te.package_instance_id
        )
 SELECT pi.id AS package_instance_id,
    pi.tenant_id,
    t.name AS tenant_name,
    t.legal_name AS tenant_legal_name,
    COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''::text), p.name) AS package_name,
    p.package_type,
    pi.manager_id,
    pi.start_date,
    pi.end_date,
    CURRENT_DATE - pi.start_date AS days_since_start,
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
    GREATEST(COALESCE(sc.max_stage_updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(tc.max_ai_updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(ltc.max_ti_updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(h.max_te_at, '1970-01-01 00:00:00+00'::timestamp with time zone)) AS last_activity_at,
        CASE
            WHEN (COALESCE(tc.ai_completed, 0::bigint) + COALESCE(ltc.ti_completed, 0::bigint)) = 0 AND COALESCE(h.hours_logged, 0::numeric) = 0::numeric THEN 'pre_release'::text
            WHEN GREATEST(COALESCE(sc.max_stage_updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(tc.max_ai_updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(ltc.max_ti_updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(h.max_te_at, '1970-01-01 00:00:00+00'::timestamp with time zone)) < (now() - '90 days'::interval) THEN 'dormant'::text
            WHEN (COALESCE(tc.ai_completed, 0::bigint) + COALESCE(ltc.ti_completed, 0::bigint)) > 0 OR COALESCE(h.hours_logged, 0::numeric) > 0::numeric OR GREATEST(COALESCE(sc.max_stage_updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(tc.max_ai_updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(ltc.max_ti_updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(h.max_te_at, '1970-01-01 00:00:00+00'::timestamp with time zone)) > (now() - '30 days'::interval) THEN 'investigate'::text
            ELSE 'review'::text
        END AS triage_category
   FROM public.package_instances pi
     JOIN public.tenants t ON t.id = pi.tenant_id
     JOIN public.packages p ON p.id = pi.package_id
     LEFT JOIN stage_counts sc ON sc.packageinstance_id = pi.id
     LEFT JOIN task_counts tc ON tc.package_instance_id = pi.id
     LEFT JOIN legacy_task_counts ltc ON ltc.package_instance_id = pi.id
     LEFT JOIN hours h ON h.package_instance_id = pi.id
  WHERE pi.is_active = true AND COALESCE(pi.is_complete, false) = false AND pi.start_date IS NOT NULL AND pi.start_date < (CURRENT_DATE - '60 days'::interval) AND COALESCE(sc.stages_complete, 0) = 0;

-- 7. Drop the backfill helper BEFORE dropping the columns -------------
DROP FUNCTION IF EXISTS public.rpc_backfill_released_stage_tasks();

-- 8. Drop the columns -------------------------------------------------
ALTER TABLE public.stage_instances DROP COLUMN released_client_tasks;
ALTER TABLE public.stage_instances DROP COLUMN released_client_tasks_date;

-- =====================================================================
-- Post-deploy verification:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='stage_instances'
--      AND column_name IN ('released_client_tasks','released_client_tasks_date');
--   -- expect 0 rows
--   SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--    WHERE n.nspname='public' AND c.relkind='v'
--      AND pg_get_viewdef(c.oid) ILIKE '%released_client_tasks%';
--   -- expect 0 rows
--   SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND pg_get_functiondef(p.oid) ILIKE '%released_client_tasks%';
--   -- expect 0 rows
-- =====================================================================
