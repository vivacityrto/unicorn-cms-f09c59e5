
-- =====================================================================
-- Billable-only filter across all package-hours aggregation surfaces.
-- Single transaction; 1 RPC + 11 views.
-- is_billable is NOT NULL DEFAULT true on time_entries; live NULL count = 0.
-- Filter is additive (narrowing); no column shape changes except
-- v_client_package_hours_recent which gets a trailing is_billable column.
-- =====================================================================

-- ----- 1) RPC: get_client_package_dashboard ---------------------------
CREATE OR REPLACE FUNCTION public.get_client_package_dashboard(
  p_tenant_id bigint,
  p_package_instance_id bigint DEFAULT NULL::bigint
)
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

GRANT EXECUTE ON FUNCTION public.get_client_package_dashboard(bigint, bigint) TO authenticated;

-- ----- 2) v_client_package_hours_timeline -----------------------------
CREATE OR REPLACE VIEW public.v_client_package_hours_timeline
WITH (security_invoker = true) AS
WITH daily AS (
  SELECT te.package_instance_id,
         pi.tenant_id,
         (te.start_at AT TIME ZONE 'Australia/Sydney'::text)::date AS activity_date,
         sum(te.duration_minutes)::numeric / 60.0 AS hours_on_day
    FROM public.time_entries te
    JOIN public.package_instances pi ON pi.id = te.package_instance_id
   WHERE te.package_instance_id IS NOT NULL
     AND te.duration_minutes IS NOT NULL
     AND te.duration_minutes > 0
     AND (pi.start_date IS NULL OR te.start_at >= pi.start_date)
     AND te.is_billable = true
   GROUP BY te.package_instance_id, pi.tenant_id, ((te.start_at AT TIME ZONE 'Australia/Sydney'::text)::date)
)
SELECT d.package_instance_id,
       d.tenant_id,
       d.activity_date,
       round(d.hours_on_day, 2) AS hours_on_day,
       round(sum(d.hours_on_day) OVER (PARTITION BY d.package_instance_id ORDER BY d.activity_date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), 2) AS cumulative_hours_used,
       row_number() OVER (PARTITION BY d.package_instance_id ORDER BY d.activity_date)::integer AS point_rank
  FROM daily d
 ORDER BY d.package_instance_id, d.activity_date;

GRANT SELECT ON public.v_client_package_hours_timeline TO authenticated;

-- ----- 3) v_client_package_hours_by_type ------------------------------
CREATE OR REPLACE VIEW public.v_client_package_hours_by_type
WITH (security_invoker = true) AS
WITH per_entry AS (
  SELECT te.package_instance_id,
         pi.tenant_id,
         COALESCE(NULLIF(TRIM(BOTH FROM te.work_type), ''::text), 'Other'::text) AS work_type,
         NULLIF(TRIM(BOTH FROM te.work_sub_type), ''::text) AS work_sub_type,
         te.duration_minutes
    FROM public.time_entries te
    JOIN public.package_instances pi ON pi.id = te.package_instance_id
   WHERE te.package_instance_id IS NOT NULL
     AND te.duration_minutes IS NOT NULL
     AND te.duration_minutes > 0
     AND (pi.start_date IS NULL OR te.start_at >= pi.start_date)
     AND te.is_billable = true
), totals AS (
  SELECT package_instance_id, sum(duration_minutes)::numeric AS total_minutes
    FROM per_entry GROUP BY package_instance_id
), grouped AS (
  SELECT pe.package_instance_id, pe.tenant_id, pe.work_type, pe.work_sub_type,
         sum(pe.duration_minutes)::numeric AS minutes,
         sum(pe.duration_minutes)::numeric / 60.0 AS hours
    FROM per_entry pe
   GROUP BY pe.package_instance_id, pe.tenant_id, pe.work_type, pe.work_sub_type
)
SELECT g.package_instance_id, g.tenant_id, g.work_type, g.work_sub_type, g.minutes,
       round(g.hours, 2) AS hours,
       CASE WHEN t.total_minutes = 0::numeric THEN 0::numeric
            ELSE round(g.minutes / t.total_minutes, 4) END AS pct_of_total,
       row_number() OVER (PARTITION BY g.package_instance_id ORDER BY g.minutes DESC, g.work_type) AS rank_in_package
  FROM grouped g JOIN totals t ON t.package_instance_id = g.package_instance_id;

GRANT SELECT ON public.v_client_package_hours_by_type TO authenticated;

-- ----- 4) v_client_package_hours_recent -------------------------------
-- No filter change. Adds trailing is_billable column.
CREATE OR REPLACE VIEW public.v_client_package_hours_recent
WITH (security_invoker = true) AS
WITH ranked AS (
  SELECT te.id AS entry_id,
         te.package_instance_id,
         pi.tenant_id,
         te.start_at AS occurred_at,
         te.duration_minutes,
         round(te.duration_minutes::numeric / 60.0, 2) AS hours,
         COALESCE(NULLIF(TRIM(BOTH FROM te.work_type), ''::text), 'Other'::text) AS work_type,
         NULLIF(TRIM(BOTH FROM te.work_sub_type), ''::text) AS work_sub_type,
         NULLIF(TRIM(BOTH FROM te.notes), ''::text) AS notes,
         te.is_billable,
         row_number() OVER (PARTITION BY te.package_instance_id ORDER BY te.start_at DESC NULLS LAST, te.id DESC) AS rank_in_package
    FROM public.time_entries te
    JOIN public.package_instances pi ON pi.id = te.package_instance_id
   WHERE te.package_instance_id IS NOT NULL
     AND te.duration_minutes IS NOT NULL
     AND te.duration_minutes > 0
     AND (pi.start_date IS NULL OR te.start_at >= pi.start_date)
)
SELECT entry_id, package_instance_id, tenant_id, occurred_at, duration_minutes,
       hours, work_type, work_sub_type, notes, rank_in_package, is_billable
  FROM ranked
 WHERE rank_in_package <= 10;

GRANT SELECT ON public.v_client_package_hours_recent TO authenticated;

-- ----- 5) v_predictive_signal_inputs (burn_30d CTE) -------------------
CREATE OR REPLACE VIEW public.v_predictive_signal_inputs
WITH (security_invoker = true) AS
WITH activity_7d AS (
  SELECT te.tenant_id::bigint AS tenant_id, te.package_id::bigint AS package_id,
         count(*) AS activity_count_7d
    FROM public.time_entries te
   WHERE te.start_at >= (now() - '7 days'::interval)
   GROUP BY te.tenant_id, te.package_id
), activity_30d AS (
  SELECT te.tenant_id::bigint AS tenant_id, te.package_id::bigint AS package_id,
         count(*) AS activity_count_30d
    FROM public.time_entries te
   WHERE te.start_at >= (now() - '30 days'::interval)
   GROUP BY te.tenant_id, te.package_id
), stage_activity_7d AS (
  SELECT cpss.tenant_id, cpss.package_id, count(*) AS stage_updates_7d
    FROM public.client_package_stage_state cpss
   WHERE cpss.updated_at >= (now() - '7 days'::interval)
   GROUP BY cpss.tenant_id, cpss.package_id
), stage_activity_30d AS (
  SELECT cpss.tenant_id, cpss.package_id, count(*) AS stage_updates_30d
    FROM public.client_package_stage_state cpss
   WHERE cpss.updated_at >= (now() - '30 days'::interval)
   GROUP BY cpss.tenant_id, cpss.package_id
), new_high_risks_7d AS (
  SELECT ei.tenant_id, count(*) AS new_high_count
    FROM public.eos_issues ei
   WHERE ei.deleted_at IS NULL
     AND ei.created_at >= (now() - '7 days'::interval)
     AND (ei.impact = ANY (ARRAY['Critical'::text, 'critical'::text, 'High'::text, 'high'::text]))
   GROUP BY ei.tenant_id
), overdue_high_risks AS (
  SELECT ei.tenant_id, count(*) AS overdue_count
    FROM public.eos_issues ei
   WHERE ei.deleted_at IS NULL
     AND (ei.status <> ALL (ARRAY['Solved'::text, 'Closed'::text, 'Archived'::text]))
     AND ei.resolved_at IS NULL
     AND (ei.impact = ANY (ARRAY['High'::text, 'high'::text]))
     AND ei.created_at < (now() - '14 days'::interval)
   GROUP BY ei.tenant_id
), docs_missing_now AS (
  SELECT d.tenant_id, d.package_id,
         count(*) FILTER (WHERE d.uploaded_files IS NULL OR array_length(d.uploaded_files, 1) IS NULL OR array_length(d.uploaded_files, 1) = 0) AS missing_docs_count
    FROM public.documents d
   GROUP BY d.tenant_id, d.package_id
), burn_30d AS (
  SELECT te.tenant_id::bigint AS tenant_id, te.package_id::bigint AS package_id,
         COALESCE(sum(te.duration_minutes), 0::bigint)::numeric / 60.0 AS hours_used_30d
    FROM public.time_entries te
   WHERE te.start_at >= (now() - '30 days'::interval)
     AND te.is_billable = true
   GROUP BY te.tenant_id, te.package_id
), current_phase AS (
  SELECT DISTINCT ON (cpss.tenant_id, cpss.package_id) cpss.tenant_id, cpss.package_id, cpss.stage_id,
         EXTRACT(day FROM now() - COALESCE(cpss.started_at, cpss.created_at))::integer AS days_in_phase
    FROM public.client_package_stage_state cpss
   WHERE cpss.is_required = true AND cpss.status <> 'complete'::text
   ORDER BY cpss.tenant_id, cpss.package_id, cpss.sort_order
), actions_remaining AS (
  SELECT tenant_id, package_instance_id, package_id, total_actions_remaining
    FROM public.v_phase_actions_remaining
)
SELECT pi.tenant_id, pi.id AS package_instance_id, pi.package_id,
       t.name AS client_name, p.name AS package_name, pi.manager_id,
       COALESCE(a7.activity_count_7d, 0::bigint) + COALESCE(sa7.stage_updates_7d, 0::bigint) AS total_activity_7d,
       COALESCE(a30.activity_count_30d, 0::bigint) + COALESCE(sa30.stage_updates_30d, 0::bigint) AS total_activity_30d,
       CASE WHEN (COALESCE(a30.activity_count_30d, 0::bigint) + COALESCE(sa30.stage_updates_30d, 0::bigint)) = 0 THEN 0::numeric
            ELSE round((COALESCE(a7.activity_count_7d, 0::bigint) + COALESCE(sa7.stage_updates_7d, 0::bigint))::numeric / GREATEST((COALESCE(a30.activity_count_30d, 0::bigint) + COALESCE(sa30.stage_updates_30d, 0::bigint))::numeric / 4.0, 1::numeric), 2)
       END AS activity_trend_ratio,
       COALESCE(nhr.new_high_count, 0::bigint) AS new_high_risks_7d,
       COALESCE(ohr.overdue_count, 0::bigint) AS overdue_high_risks,
       COALESCE(dm.missing_docs_count, 0::bigint) AS missing_docs_now,
       COALESCE(b30.hours_used_30d, 0::numeric) AS hours_used_30d,
       (COALESCE(pi.hours_included, 0) + COALESCE(pi.hours_added, 0))::numeric - COALESCE(pi.hours_used, 0::numeric) AS remaining_hours,
       CASE WHEN COALESCE(b30.hours_used_30d, 0::numeric) > 0::numeric
            THEN round(((COALESCE(pi.hours_included, 0) + COALESCE(pi.hours_added, 0))::numeric - COALESCE(pi.hours_used, 0::numeric)) / (COALESCE(b30.hours_used_30d, 0::numeric) / 30.0), 0)
            ELSE 9999::numeric END AS projected_days_to_exhaustion,
       COALESCE(cp.days_in_phase, 0) AS days_in_current_phase,
       COALESCE(ar.total_actions_remaining, 0) AS actions_remaining
  FROM public.package_instances pi
  JOIN public.tenants t ON t.id = pi.tenant_id
  JOIN public.packages p ON p.id = pi.package_id
  LEFT JOIN activity_7d a7 ON a7.tenant_id = pi.tenant_id AND a7.package_id = pi.package_id
  LEFT JOIN activity_30d a30 ON a30.tenant_id = pi.tenant_id AND a30.package_id = pi.package_id
  LEFT JOIN stage_activity_7d sa7 ON sa7.tenant_id = pi.tenant_id AND sa7.package_id = pi.package_id
  LEFT JOIN stage_activity_30d sa30 ON sa30.tenant_id = pi.tenant_id AND sa30.package_id = pi.package_id
  LEFT JOIN new_high_risks_7d nhr ON nhr.tenant_id = pi.tenant_id
  LEFT JOIN overdue_high_risks ohr ON ohr.tenant_id = pi.tenant_id
  LEFT JOIN docs_missing_now dm ON dm.tenant_id = pi.tenant_id AND dm.package_id = pi.package_id
  LEFT JOIN burn_30d b30 ON b30.tenant_id = pi.tenant_id AND b30.package_id = pi.package_id
  LEFT JOIN current_phase cp ON cp.tenant_id = pi.tenant_id AND cp.package_id = pi.package_id
  LEFT JOIN actions_remaining ar ON ar.tenant_id = pi.tenant_id AND ar.package_id = pi.package_id
 WHERE pi.is_complete = false;

GRANT SELECT ON public.v_predictive_signal_inputs TO authenticated;

-- ----- 6) v_package_burndown -----------------------------------------
CREATE OR REPLACE VIEW public.v_package_burndown
WITH (security_invoker = true) AS
SELECT pi.tenant_id,
       pi.id AS package_instance_id,
       COALESCE(pi.included_minutes, 0) + COALESCE(pi.hours_added, 0) * 60 AS included_minutes,
       COALESCE(ts.used_minutes, 0::bigint) AS used_minutes,
       COALESCE(pi.included_minutes, 0) + COALESCE(pi.hours_added, 0) * 60 - COALESCE(ts.used_minutes, 0::bigint) AS remaining_minutes,
       CASE WHEN (COALESCE(pi.included_minutes, 0) + COALESCE(pi.hours_added, 0) * 60) = 0 THEN 0::numeric
            ELSE round(COALESCE(ts.used_minutes, 0::bigint)::numeric / (COALESCE(pi.included_minutes, 0) + COALESCE(pi.hours_added, 0) * 60)::numeric * 100::numeric, 1)
       END AS percent_used
  FROM public.package_instances pi
  LEFT JOIN (
    SELECT te.package_id, sum(te.duration_minutes) AS used_minutes
      FROM public.time_entries te
      JOIN public.package_instances pi2 ON pi2.id = te.package_id
     WHERE te.package_id IS NOT NULL
       AND te.start_at >= (COALESCE(pi2.next_renewal_date::timestamp without time zone, pi2.start_date + '1 year'::interval) - '1 year'::interval)
       AND te.start_at < COALESCE(pi2.next_renewal_date::timestamp without time zone, pi2.start_date + '1 year'::interval)
       AND te.is_billable = true
     GROUP BY te.package_id
  ) ts ON ts.package_id = pi.id
 WHERE pi.is_complete = false;

GRANT SELECT ON public.v_package_burndown TO authenticated;

-- ----- 7) v_package_time_summary -------------------------------------
CREATE OR REPLACE VIEW public.v_package_time_summary
WITH (security_invoker = true) AS
SELECT te.tenant_id,
       te.package_id AS package_instance_id,
       sum(te.duration_minutes) FILTER (WHERE date_trunc('month'::text, te.start_at) = date_trunc('month'::text, now())) AS minutes_month,
       sum(te.duration_minutes) AS minutes_ytd,
       sum(te.duration_minutes) AS minutes_total,
       max(te.start_at) AS last_entry_at
  FROM public.time_entries te
  JOIN public.package_instances pi ON pi.id = te.package_id
 WHERE te.package_id IS NOT NULL
   AND te.start_at >= (COALESCE(pi.next_renewal_date::timestamp without time zone, pi.start_date + '1 year'::interval) - '1 year'::interval)
   AND te.start_at < COALESCE(pi.next_renewal_date::timestamp without time zone, pi.start_date + '1 year'::interval)
   AND te.is_billable = true
 GROUP BY te.tenant_id, te.package_id;

GRANT SELECT ON public.v_package_time_summary TO authenticated;

-- ----- 8) v_dashboard_weekly_wins ------------------------------------
CREATE OR REPLACE VIEW public.v_dashboard_weekly_wins
WITH (security_invoker = true) AS
WITH week_bounds AS (
  SELECT date_trunc('week'::text, (now() AT TIME ZONE 'Australia/Sydney'::text))::timestamp with time zone AS week_start,
         (date_trunc('week'::text, (now() AT TIME ZONE 'Australia/Sydney'::text)) + '7 days'::interval)::timestamp with time zone AS week_end
)
SELECT u.user_uuid,
       wb.week_start::date AS week_start_date,
       COALESCE((SELECT count(*) FROM public.eos_rocks r
                  WHERE r.owner_id = u.user_uuid AND r.status = 'complete'::text
                    AND r.completed_date >= wb.week_start::date AND r.completed_date < wb.week_end::date), 0::bigint)::integer AS rocks_closed,
       COALESCE((SELECT count(*) FROM public.client_package_stage_state cpss
                   JOIN public.package_instances pi ON pi.package_id = cpss.package_id AND pi.tenant_id = cpss.tenant_id
                  WHERE pi.manager_id = u.user_uuid AND cpss.status = 'complete'::text
                    AND cpss.completed_at >= wb.week_start AND cpss.completed_at < wb.week_end), 0::bigint)::integer AS phases_completed,
       COALESCE((SELECT count(*) FROM public.document_instances di
                  WHERE di.isgenerated = true AND di.created_at >= wb.week_start AND di.created_at < wb.week_end
                    AND (di.tenant_id IN (SELECT pi2.tenant_id FROM public.package_instances pi2
                                           WHERE pi2.manager_id = u.user_uuid AND pi2.is_complete = false))), 0::bigint)::integer AS documents_generated,
       COALESCE((SELECT count(DISTINCT cpss2.tenant_id) FROM public.client_package_stage_state cpss2
                   JOIN public.package_instances pi3 ON pi3.package_id = cpss2.package_id AND pi3.tenant_id = cpss2.tenant_id
                  WHERE pi3.manager_id = u.user_uuid AND cpss2.updated_at >= wb.week_start AND cpss2.updated_at < wb.week_end
                    AND (cpss2.status = ANY (ARRAY['complete'::text, 'in_progress'::text]))), 0::bigint)::integer AS clients_moved_forward,
       COALESCE((SELECT round(sum(te.duration_minutes)::numeric / 60.0, 1) FROM public.time_entries te
                  WHERE te.user_id = u.user_uuid AND te.created_at >= wb.week_start AND te.created_at < wb.week_end
                    AND te.is_billable = true), 0::numeric) AS hours_logged,
       COALESCE((SELECT count(*) FROM public.celebration_events ce
                  WHERE ce.actor_user_uuid = u.user_uuid AND ce.created_at >= wb.week_start AND ce.created_at < wb.week_end), 0::bigint)::integer AS milestones_count
  FROM public.users u
  CROSS JOIN week_bounds wb
 WHERE u.is_vivacity_internal = true;

GRANT SELECT ON public.v_dashboard_weekly_wins TO authenticated;

-- ----- 9) v_dashboard_tenant_portfolio (NO WITH clause) ---------------
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
       COALESCE(sh.worst_health, 'healthy'::text) AS worst_stage_health_status,
       COALESCE(sh.critical_count, 0::bigint)::integer AS critical_stage_count,
       COALESCE(sh.at_risk_count, 0::bigint)::integer AS at_risk_stage_count,
       COALESCE(tk.open_count, 0::bigint)::integer AS open_tasks_count,
       COALESCE(tk.overdue_count, 0::bigint)::integer AS overdue_tasks_count,
       COALESCE(eg.mandatory_gaps, 0) AS mandatory_gaps_count,
       COALESCE(cl.hours_30d, 0::numeric) AS consult_hours_30d,
       COALESCE(bf.burn_risk_status, 'normal'::text) AS burn_risk_status,
       bf.projected_exhaustion_date,
       COALESCE(rf.retention_status, 'stable'::text) AS retention_status,
       rf.composite_retention_risk_index,
       tla.last_activity_at
  FROM public.tenants t
  LEFT JOIN LATERAL (
    SELECT CASE re.severity
             WHEN 'critical'::text THEN 90 WHEN 'high'::text THEN 70
             WHEN 'moderate'::text THEN 40 ELSE 10
           END AS risk_index
      FROM public.risk_events re WHERE re.tenant_id = t.id
      ORDER BY re.created_at DESC LIMIT 1
  ) ri ON true
  LEFT JOIN LATERAL (
    SELECT CASE min(CASE sub.hs WHEN 'critical'::text THEN 1 WHEN 'at_risk'::text THEN 2 WHEN 'monitoring'::text THEN 3 ELSE 4 END)
             WHEN 1 THEN 'critical'::text WHEN 2 THEN 'at_risk'::text WHEN 3 THEN 'monitoring'::text ELSE 'healthy'::text
           END AS worst_health,
           count(*) FILTER (WHERE sub.hs = 'critical'::text) AS critical_count,
           count(*) FILTER (WHERE sub.hs = 'at_risk'::text) AS at_risk_count
      FROM (SELECT DISTINCT ON (shs.stage_instance_id) shs.health_status AS hs
              FROM public.stage_health_snapshots shs WHERE shs.tenant_id = t.id
             ORDER BY shs.stage_instance_id, shs.generated_at DESC) sub
  ) sh ON true
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE cai.completed_at IS NULL) AS open_count,
           count(*) FILTER (WHERE cai.completed_at IS NULL AND cai.due_date IS NOT NULL AND cai.due_date < CURRENT_DATE) AS overdue_count,
           max(cai.updated_at) AS latest_task_at
      FROM public.client_action_items cai WHERE cai.tenant_id = t.id
  ) tk ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(jsonb_array_length(egc.missing_categories_json)), 0::bigint)::integer AS mandatory_gaps,
           max(egc.created_at) AS latest_gap_at
      FROM public.evidence_gap_checks egc
     WHERE egc.tenant_id = t.id AND egc.status = 'gaps_found'::text
  ) eg ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(sum(te.duration_minutes)::numeric / 60.0, 0::numeric) AS hours_30d
      FROM public.time_entries te
     WHERE te.tenant_id = t.id
       AND te.start_at >= (now() - '30 days'::interval)
       AND te.is_billable = true
  ) cl ON true
  LEFT JOIN LATERAL (
    SELECT bf2.burn_risk_status, bf2.projected_exhaustion_date
      FROM public.tenant_package_burn_forecast bf2 WHERE bf2.tenant_id = t.id
     ORDER BY (CASE bf2.burn_risk_status WHEN 'critical'::text THEN 1 WHEN 'warning'::text THEN 2 ELSE 3 END) LIMIT 1
  ) bf ON true
  LEFT JOIN LATERAL (
    SELECT rf2.retention_status, rf2.composite_retention_risk_index
      FROM public.tenant_retention_forecasts rf2 WHERE rf2.tenant_id = t.id
     ORDER BY rf2.forecast_date DESC LIMIT 1
  ) rf ON true
  LEFT JOIN public.v_tenant_last_activity tla ON tla.tenant_id = t.id
 WHERE t.status = 'active'::text AND COALESCE(t.is_system_tenant, false) = false;

GRANT SELECT ON public.v_dashboard_tenant_portfolio TO authenticated;

-- ----- 10) v_admin_zero_progress_packages ----------------------------
CREATE OR REPLACE VIEW public.v_admin_zero_progress_packages
WITH (security_invoker = true) AS
WITH stage_counts AS (
  SELECT si.packageinstance_id,
         count(*)::integer AS stages_total,
         count(*) FILTER (WHERE si.status_id = ANY (ARRAY[2, 3]))::integer AS stages_complete,
         count(*) FILTER (WHERE COALESCE(si.released_client_tasks, false))::integer AS stages_released,
         max(si.updated_at) AS max_stage_updated_at
    FROM public.stage_instances si GROUP BY si.packageinstance_id
), task_counts AS (
  SELECT cai.package_id AS package_instance_id,
         count(*) AS ai_total,
         count(*) FILTER (WHERE cai.completed_at IS NOT NULL) AS ai_completed,
         max(cai.updated_at) AS max_ai_updated_at
    FROM public.client_action_items cai WHERE cai.package_id IS NOT NULL GROUP BY cai.package_id
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
   WHERE te.package_instance_id IS NOT NULL
     AND te.is_billable = true
   GROUP BY te.package_instance_id
)
SELECT pi.id AS package_instance_id, pi.tenant_id,
       t.name AS tenant_name, t.legal_name AS tenant_legal_name,
       COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''::text), p.name) AS package_name,
       p.package_type, pi.manager_id, pi.start_date, pi.end_date,
       CURRENT_DATE - pi.start_date AS days_since_start,
       pi.is_active, pi.is_complete,
       COALESCE(sc.stages_total, 0) AS stages_total,
       COALESCE(sc.stages_complete, 0) AS stages_complete,
       COALESCE(sc.stages_released, 0) AS stages_released,
       COALESCE(tc.ai_total, 0::bigint) AS action_items_total,
       COALESCE(tc.ai_completed, 0::bigint) AS action_items_completed,
       COALESCE(ltc.ti_total, 0::bigint) AS legacy_tasks_total,
       COALESCE(ltc.ti_completed, 0::bigint) AS legacy_tasks_completed,
       COALESCE(ltc.ti_open, 0::bigint) AS legacy_tasks_open,
       COALESCE(h.hours_logged, 0::numeric) AS hours_logged,
       GREATEST(COALESCE(sc.max_stage_updated_at, '1970-01-01 00:00:00+00'::timestamptz),
                COALESCE(tc.max_ai_updated_at, '1970-01-01 00:00:00+00'::timestamptz),
                COALESCE(ltc.max_ti_updated_at, '1970-01-01 00:00:00+00'::timestamptz),
                COALESCE(h.max_te_at, '1970-01-01 00:00:00+00'::timestamptz)) AS last_activity_at,
       CASE
         WHEN COALESCE(sc.stages_released, 0) = 0 AND (COALESCE(tc.ai_completed, 0::bigint) + COALESCE(ltc.ti_completed, 0::bigint)) = 0 AND COALESCE(h.hours_logged, 0::numeric) = 0::numeric THEN 'pre_release'::text
         WHEN GREATEST(COALESCE(sc.max_stage_updated_at, '1970-01-01 00:00:00+00'::timestamptz), COALESCE(tc.max_ai_updated_at, '1970-01-01 00:00:00+00'::timestamptz), COALESCE(ltc.max_ti_updated_at, '1970-01-01 00:00:00+00'::timestamptz), COALESCE(h.max_te_at, '1970-01-01 00:00:00+00'::timestamptz)) < (now() - '90 days'::interval) THEN 'dormant'::text
         WHEN (COALESCE(tc.ai_completed, 0::bigint) + COALESCE(ltc.ti_completed, 0::bigint)) > 0 OR COALESCE(h.hours_logged, 0::numeric) > 0::numeric OR GREATEST(COALESCE(sc.max_stage_updated_at, '1970-01-01 00:00:00+00'::timestamptz), COALESCE(tc.max_ai_updated_at, '1970-01-01 00:00:00+00'::timestamptz), COALESCE(ltc.max_ti_updated_at, '1970-01-01 00:00:00+00'::timestamptz), COALESCE(h.max_te_at, '1970-01-01 00:00:00+00'::timestamptz)) > (now() - '30 days'::interval) THEN 'investigate'::text
         ELSE 'review'::text
       END AS triage_category
  FROM public.package_instances pi
  JOIN public.tenants t ON t.id = pi.tenant_id
  JOIN public.packages p ON p.id = pi.package_id
  LEFT JOIN stage_counts sc ON sc.packageinstance_id = pi.id
  LEFT JOIN task_counts tc ON tc.package_instance_id = pi.id
  LEFT JOIN legacy_task_counts ltc ON ltc.package_instance_id = pi.id
  LEFT JOIN hours h ON h.package_instance_id = pi.id
 WHERE pi.is_active = true
   AND COALESCE(pi.is_complete, false) = false
   AND pi.start_date IS NOT NULL
   AND pi.start_date < (CURRENT_DATE - '60 days'::interval)
   AND COALESCE(sc.stages_complete, 0) = 0;

GRANT SELECT ON public.v_admin_zero_progress_packages TO authenticated;

-- ----- 11) v_client_package_dashboard (legacy view) ------------------
CREATE OR REPLACE VIEW public.v_client_package_dashboard
WITH (security_invoker = true) AS
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
   WHERE (si.status_id IS NULL OR (si.status_id <> ALL (ARRAY[2, 3])))
     AND COALESCE(s.is_archived, false) = false
     AND COALESCE(s.is_audit_workspace, false) = false
     AND app.user_can_access_tenant(pi_1.tenant_id)
   ORDER BY si.packageinstance_id, si.stage_sortorder
), action_items_agg AS (
  SELECT cai.package_id AS package_instance_id,
         count(*)::integer AS open_count,
         count(*) FILTER (WHERE cai.due_date < now()::date)::integer AS overdue_count,
         max(cai.updated_at) AS last_updated
    FROM public.client_action_items cai
   WHERE cai.package_id IS NOT NULL AND cai.completed_at IS NULL
     AND (COALESCE(cai.status, 'open'::text) <> ALL (ARRAY['completed'::text, 'cancelled'::text]))
     AND app.user_can_access_tenant(cai.tenant_id::bigint)
   GROUP BY cai.package_id
), task_instances_agg AS (
  SELECT si.packageinstance_id AS package_instance_id,
         count(*)::integer AS open_count,
         count(*) FILTER (WHERE cti.due_date < now())::integer AS overdue_count,
         max(cti.updated_at) AS last_updated
    FROM public.client_task_instances cti
    JOIN public.stage_instances si ON si.id = cti.stageinstance_id
    JOIN public.package_instances pi_1 ON pi_1.id = si.packageinstance_id
   WHERE COALESCE(cti.is_archived, false) = false AND cti.completion_date IS NULL
     AND COALESCE(cti.status, 0) <> 2 AND COALESCE(si.released_client_tasks, false) = true
     AND app.user_can_access_tenant(pi_1.tenant_id)
   GROUP BY si.packageinstance_id
), tasks_agg AS (
  SELECT COALESCE(a.package_instance_id, t.package_instance_id) AS package_instance_id,
         COALESCE(a.open_count, 0) + COALESCE(t.open_count, 0) AS open_tasks,
         COALESCE(a.overdue_count, 0) + COALESCE(t.overdue_count, 0) AS overdue_tasks,
         GREATEST(a.last_updated, t.last_updated) AS tasks_last_updated
    FROM action_items_agg a FULL JOIN task_instances_agg t ON t.package_instance_id = a.package_instance_id
), notes_agg AS (
  SELECT n.parent_id AS package_instance_id, max(n.updated_at) AS notes_last_updated
    FROM public.notes n
   WHERE n.parent_type = 'package_instance'::text AND n.parent_id IS NOT NULL
     AND app.user_can_access_tenant(n.tenant_id)
   GROUP BY n.parent_id
), pinned AS (
  SELECT DISTINCT ON (n.parent_id) n.parent_id AS package_instance_id,
         n.title AS pinned_note_title, n.note_details AS pinned_note_text,
         n.priority AS pinned_note_priority, n.updated_at AS pinned_note_updated_at
    FROM public.notes n
   WHERE n.parent_type = 'package_instance'::text AND n.is_pinned = true
     AND n.parent_id IS NOT NULL AND app.user_can_access_tenant(n.tenant_id)
   ORDER BY n.parent_id, n.updated_at DESC NULLS LAST
), hours_agg AS (
  SELECT te.package_instance_id,
         COALESCE(sum(te.duration_minutes), 0::bigint)::numeric / 60.0 AS hours_used_calc,
         max(te.start_at) AS max_te_at
    FROM public.time_entries te
    JOIN public.package_instances pi2 ON pi2.id = te.package_instance_id
   WHERE te.package_instance_id IS NOT NULL
     AND te.duration_minutes IS NOT NULL
     AND te.duration_minutes > 0
     AND (pi2.start_date IS NULL OR te.start_at >= pi2.start_date)
     AND app.user_can_access_tenant(pi2.tenant_id)
     AND te.is_billable = true
   GROUP BY te.package_instance_id
), most_recent_activity AS (
  SELECT pi_1.id AS package_instance_id,
         COALESCE(GREATEST(na_1.notes_last_updated, sa_1.stage_last_updated, ta_1.tasks_last_updated, ha_1.max_te_at), pi_1.start_date::timestamptz) AS last_activity_at
    FROM public.package_instances pi_1
    LEFT JOIN notes_agg na_1 ON na_1.package_instance_id = pi_1.id
    LEFT JOIN stage_agg sa_1 ON sa_1.package_instance_id = pi_1.id
    LEFT JOIN tasks_agg ta_1 ON ta_1.package_instance_id = pi_1.id
    LEFT JOIN hours_agg ha_1 ON ha_1.package_instance_id = pi_1.id
)
SELECT pi.id AS package_instance_id, pi.tenant_id,
       COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''::text), p.name) AS package_name,
       p.package_type, p.progress_mode, pi.manager_id, pi.is_complete,
       pi.start_date, pi.end_date,
       COALESCE(pi.hours_included, 0) AS hours_included,
       COALESCE(pi.hours_added, 0) AS hours_added,
       (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0))::numeric AS hours_total,
       COALESCE(ha.hours_used_calc, 0::numeric) AS hours_used,
       GREATEST((COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0))::numeric - COALESCE(ha.hours_used_calc, 0::numeric), 0::numeric) AS hours_remaining,
       CASE WHEN (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0)) = 0 THEN 0::numeric
            ELSE round(COALESCE(ha.hours_used_calc, 0::numeric) / (COALESCE(p.total_hours, 0) + COALESCE(pi.hours_added, 0))::numeric, 4)
       END AS hours_pct_used,
       COALESCE(sa.stages_total, 0) AS stages_total,
       COALESCE(sa.stages_complete, 0) AS stages_complete,
       sa.current_stage_sortorder,
       COALESCE(ta.open_tasks, 0) AS open_tasks,
       COALESCE(ta.overdue_tasks, 0) AS overdue_tasks,
       mra.last_activity_at,
       pn.pinned_note_title, pn.pinned_note_text, pn.pinned_note_priority, pn.pinned_note_updated_at,
       CASE
         WHEN pn.pinned_note_text IS NULL AND pn.pinned_note_title IS NULL THEN NULL::text
         WHEN lower((COALESCE(pn.pinned_note_text, ''::text) || ' '::text) || COALESCE(pn.pinned_note_title, ''::text)) LIKE '%on hold%'::text THEN 'hold'::text
         WHEN lower((COALESCE(pn.pinned_note_text, ''::text) || ' '::text) || COALESCE(pn.pinned_note_title, ''::text)) ~ '(urgent|overdue)'::text THEN 'urgent'::text
         ELSE 'info'::text
       END AS pinned_note_severity,
       CASE
         WHEN pn.pinned_note_text IS NOT NULL AND lower((COALESCE(pn.pinned_note_text, ''::text) || ' '::text) || COALESCE(pn.pinned_note_title, ''::text)) LIKE '%on hold%'::text THEN 'on_hold'::text
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

GRANT SELECT ON public.v_client_package_dashboard TO authenticated;

-- ----- 12) v_client_home_feed (te_recent CTE) ------------------------
CREATE OR REPLACE VIEW public.v_client_home_feed
WITH (security_invoker = true) AS
WITH cai_due_upcoming AS (
  SELECT 'coming_up'::text AS feed_section, 'task_due'::text AS event_type,
         cai.tenant_id::bigint AS tenant_id, cai.package_id AS package_instance_id,
         cai.due_date::timestamptz AS event_at, cai.title, NULL::text AS subtitle,
         cai.id::text AS event_uid, 'client_action_items'::text AS source_table,
         '/client/tasks'::text AS href, NULL::text AS package_name
    FROM public.client_action_items cai
   WHERE cai.due_date IS NOT NULL AND cai.completed_at IS NULL
     AND (COALESCE(cai.status, 'open'::text) <> ALL (ARRAY['completed'::text, 'cancelled'::text]))
     AND cai.due_date >= now()::date AND cai.due_date < (now() + '84 days'::interval)::date
), cti_due_upcoming AS (
  SELECT 'coming_up'::text, 'task_due'::text, pi.tenant_id, pi.id, cti.due_date,
         COALESCE(ct.name, 'Task'::text), NULL::text, cti.id::text,
         'client_task_instances'::text, '/client/tasks'::text,
         COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''::text), p.name)
    FROM public.client_task_instances cti
    JOIN public.stage_instances si ON si.id = cti.stageinstance_id
    JOIN public.package_instances pi ON pi.id = si.packageinstance_id
    JOIN public.packages p ON p.id = pi.package_id
    LEFT JOIN public.client_tasks ct ON ct.id = cti.clienttask_id
   WHERE COALESCE(cti.is_archived, false) = false AND cti.completion_date IS NULL
     AND COALESCE(cti.status, 0) <> 2 AND COALESCE(si.released_client_tasks, false) = true
     AND cti.due_date IS NOT NULL AND cti.due_date >= now()
     AND cti.due_date < (now() + '84 days'::interval) AND pi.is_complete = false
), cai_overdue AS (
  SELECT 'needs_attention'::text, 'task_overdue'::text, cai.tenant_id::bigint, cai.package_id,
         cai.due_date::timestamptz, cai.title, 'Overdue task'::text, cai.id::text,
         'client_action_items'::text, '/client/tasks'::text, NULL::text
    FROM public.client_action_items cai
   WHERE cai.due_date IS NOT NULL AND cai.completed_at IS NULL
     AND (COALESCE(cai.status, 'open'::text) <> ALL (ARRAY['completed'::text, 'cancelled'::text]))
     AND cai.due_date < now()::date
), cti_overdue AS (
  SELECT 'needs_attention'::text, 'task_overdue'::text, pi.tenant_id, pi.id, cti.due_date,
         COALESCE(ct.name, 'Task'::text), 'Overdue task'::text, cti.id::text,
         'client_task_instances'::text, '/client/tasks'::text,
         COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''::text), p.name)
    FROM public.client_task_instances cti
    JOIN public.stage_instances si ON si.id = cti.stageinstance_id
    JOIN public.package_instances pi ON pi.id = si.packageinstance_id
    JOIN public.packages p ON p.id = pi.package_id
    LEFT JOIN public.client_tasks ct ON ct.id = cti.clienttask_id
   WHERE COALESCE(cti.is_archived, false) = false AND cti.completion_date IS NULL
     AND COALESCE(cti.status, 0) <> 2 AND COALESCE(si.released_client_tasks, false) = true
     AND cti.due_date IS NOT NULL AND cti.due_date < now() AND pi.is_complete = false
), urgent_notes AS (
  SELECT 'needs_attention'::text, 'urgent_note'::text, n.tenant_id, n.parent_id, n.updated_at,
         COALESCE(n.title, 'Urgent note'::text), NULL::text, n.id::text,
         'notes'::text, '/client/packages'::text,
         COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''::text), p.name)
    FROM public.notes n
    JOIN public.package_instances pi ON pi.id = n.parent_id
    JOIN public.packages p ON p.id = pi.package_id
   WHERE n.parent_type = 'package_instance'::text AND COALESCE(n.is_pinned, false) = true
     AND pi.is_complete = false
     AND lower((COALESCE(n.note_details, ''::text) || ' '::text) || COALESCE(n.title, ''::text)) ~ '(urgent|overdue|action required)'::text
), te_recent AS (
  SELECT 'recent_activity'::text, 'consult_logged'::text, pi.tenant_id, pi.id, te.start_at,
         COALESCE(NULLIF(TRIM(BOTH FROM te.work_type), ''::text), 'Other'::text),
         NULLIF(TRIM(BOTH FROM te.work_sub_type), ''::text), te.id::text,
         'time_entries'::text, '/client/packages'::text,
         COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''::text), p.name)
    FROM public.time_entries te
    JOIN public.package_instances pi ON pi.id = te.package_instance_id
    JOIN public.packages p ON p.id = pi.package_id
   WHERE te.duration_minutes IS NOT NULL AND te.duration_minutes > 0
     AND te.start_at >= (now() - '30 days'::interval)
     AND (pi.start_date IS NULL OR te.start_at >= pi.start_date)
     AND pi.is_complete = false
     AND te.is_billable = true
), stages_completed_recent AS (
  SELECT 'recent_activity'::text, 'stage_completed'::text, pi.tenant_id, pi.id, si.status_date,
         COALESCE(NULLIF(TRIM(BOTH FROM s.name), ''::text), s.shortname),
         'Stage complete'::text, si.id::text,
         'stage_instances'::text, '/client/packages'::text,
         COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''::text), p.name)
    FROM public.stage_instances si
    JOIN public.package_instances pi ON pi.id = si.packageinstance_id
    JOIN public.packages p ON p.id = pi.package_id
    JOIN public.stages s ON s.id = si.stage_id
   WHERE (si.status_id = ANY (ARRAY[2, 3])) AND si.status_date IS NOT NULL
     AND si.status_date >= (now() - '30 days'::interval)
     AND COALESCE(s.is_archived, false) = false AND COALESCE(s.is_audit_workspace, false) = false
     AND pi.is_complete = false
), stages_released_recent AS (
  SELECT 'recent_activity'::text, 'stage_released'::text, pi.tenant_id, pi.id,
         si.released_client_tasks_date::timestamptz,
         COALESCE(NULLIF(TRIM(BOTH FROM s.name), ''::text), s.shortname),
         'Stage released'::text, si.id::text,
         'stage_instances'::text, '/client/packages'::text,
         COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''::text), p.name)
    FROM public.stage_instances si
    JOIN public.package_instances pi ON pi.id = si.packageinstance_id
    JOIN public.packages p ON p.id = pi.package_id
    JOIN public.stages s ON s.id = si.stage_id
   WHERE COALESCE(si.released_client_tasks, false) = true
     AND si.released_client_tasks_date IS NOT NULL
     AND si.released_client_tasks_date >= (now() - '30 days'::interval)
     AND COALESCE(s.is_archived, false) = false AND COALESCE(s.is_audit_workspace, false) = false
     AND pi.is_complete = false
), cai_completed_recent AS (
  SELECT 'recent_activity'::text, 'task_completed'::text, cai.tenant_id::bigint, cai.package_id,
         cai.completed_at, cai.title, 'Task completed'::text, cai.id::text,
         'client_action_items'::text, '/client/tasks'::text, NULL::text
    FROM public.client_action_items cai
   WHERE cai.completed_at IS NOT NULL AND cai.completed_at >= (now() - '30 days'::interval)
)
SELECT feed_section, event_type, tenant_id, package_instance_id, event_at,
       title, subtitle, event_uid, source_table, href, package_name
  FROM (
    SELECT * FROM cai_due_upcoming
    UNION ALL SELECT * FROM cti_due_upcoming
    UNION ALL SELECT * FROM cai_overdue
    UNION ALL SELECT * FROM cti_overdue
    UNION ALL SELECT * FROM urgent_notes
    UNION ALL SELECT * FROM te_recent
    UNION ALL SELECT * FROM stages_completed_recent
    UNION ALL SELECT * FROM stages_released_recent
    UNION ALL SELECT * FROM cai_completed_recent
  ) all_events(feed_section, event_type, tenant_id, package_instance_id, event_at,
               title, subtitle, event_uid, source_table, href, package_name)
 WHERE event_at IS NOT NULL;

GRANT SELECT ON public.v_client_home_feed TO authenticated;

-- =====================================================================
-- COMMENTS for audit trail
-- =====================================================================
COMMENT ON FUNCTION public.get_client_package_dashboard(bigint, bigint) IS 'Client package dashboard. hours_agg filters is_billable = true so burndown reflects contracted hours only (non-billable goodwill time is not deducted).';
COMMENT ON VIEW public.v_client_package_hours_timeline IS 'Daily billable hours per package (Australia/Sydney). is_billable = true filter applied.';
COMMENT ON VIEW public.v_client_package_hours_by_type IS 'Billable hours grouped by work_type per package. is_billable = true filter applied.';
COMMENT ON VIEW public.v_client_package_hours_recent IS 'Most recent (up to 10) time entries per package. All entries shown (billable + non-billable); is_billable column lets the UI badge non-billable entries as "Included".';
COMMENT ON VIEW public.v_predictive_signal_inputs IS 'Predictive risk inputs. burn_30d CTE filters is_billable = true.';
COMMENT ON VIEW public.v_package_burndown IS 'Renewal-year burndown. Billable hours only.';
COMMENT ON VIEW public.v_package_time_summary IS 'Renewal-year package time totals. Billable hours only.';
COMMENT ON VIEW public.v_dashboard_weekly_wins IS 'Weekly wins per Vivacity staff member. hours_logged is billable-only.';
COMMENT ON VIEW public.v_dashboard_tenant_portfolio IS 'Tenant portfolio rollup. consult_hours_30d filters is_billable = true.';
COMMENT ON VIEW public.v_admin_zero_progress_packages IS 'Stalled-package detection. hours CTE filters is_billable = true.';
COMMENT ON VIEW public.v_client_package_dashboard IS 'Legacy client package dashboard view. hours_agg filters is_billable = true.';
COMMENT ON VIEW public.v_client_home_feed IS 'Client home page activity feed. te_recent filters is_billable = true so the recent-activity panel reflects contracted consults; non-billable entries surface only in the per-package Recent Work view.';
