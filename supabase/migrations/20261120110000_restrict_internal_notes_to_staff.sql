-- Stop internal notes reaching clients.
-- Changes row-level security policies on three tables, one view and two functions. No row is changed.
--
-- Found during the package analytics review (and confirmed with a rolled-back test): the notes table let ANY member of a
-- client organisation read, edit and delete every note for that organisation, including Vivacity's internal ones. In
-- the test, one client contact could read, change and delete all 139 of their organisation's notes. The same pattern is
-- on client_notes and tenant_notes. No client has ever written a row in any of the three tables (0 of 11,911 notes,
-- 22 client notes, 19 tenant notes were authored by a non-staff user) and no client-portal page reads them directly,
-- so these tables are staff-only by design and the policies simply allowed more than anything used.
--
-- Decision (Carl, 20 November 2026): remove, for now, the two client-facing things that were built on internal notes:
--   * the pinned-note banner on the package page (text, title, priority, severity of the pinned note), and
--   * the "urgent note" item on the client Home feed (the title of a pinned note containing urgent / overdue /
--     action required).
-- If staff should ever share a note with a client on purpose, that needs an explicit "share with client" option.
--
-- Also stops the client "recent work" list returning staff free-text time-entry notes.
-- The package status pill ("on hold", "stuck", "drifting", "on track") is unchanged: it is still worked out on the server.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. notes, client_notes, tenant_notes: Vivacity staff and super admins only
-- ---------------------------------------------------------------------------------------------------------------

drop policy if exists notes_select on public.notes;
drop policy if exists notes_insert on public.notes;
drop policy if exists notes_update on public.notes;
drop policy if exists notes_delete on public.notes;

create policy notes_select on public.notes
  for select to authenticated
  using (public.is_super_admin_safe((select auth.uid())) or public.is_vivacity_team_safe((select auth.uid())));
create policy notes_insert on public.notes
  for insert to authenticated
  with check (public.is_super_admin_safe((select auth.uid())) or public.is_vivacity_team_safe((select auth.uid())));
create policy notes_update on public.notes
  for update to authenticated
  using (public.is_super_admin_safe((select auth.uid())) or public.is_vivacity_team_safe((select auth.uid())))
  with check (public.is_super_admin_safe((select auth.uid())) or public.is_vivacity_team_safe((select auth.uid())));
create policy notes_delete on public.notes
  for delete to authenticated
  using (public.is_super_admin_safe((select auth.uid())) or public.is_vivacity_team_safe((select auth.uid())));

drop policy if exists client_notes_select on public.client_notes;
drop policy if exists client_notes_insert on public.client_notes;
drop policy if exists client_notes_update on public.client_notes;
drop policy if exists client_notes_delete on public.client_notes;

create policy client_notes_select on public.client_notes
  for select to authenticated
  using (public.is_super_admin_safe((select auth.uid())) or public.is_vivacity_team_safe((select auth.uid())));
create policy client_notes_insert on public.client_notes
  for insert to authenticated
  with check (public.is_super_admin_safe((select auth.uid())) or public.is_vivacity_team_safe((select auth.uid())));
create policy client_notes_update on public.client_notes
  for update to authenticated
  using (public.is_super_admin_safe((select auth.uid())) or public.is_vivacity_team_safe((select auth.uid())))
  with check (public.is_super_admin_safe((select auth.uid())) or public.is_vivacity_team_safe((select auth.uid())));
create policy client_notes_delete on public.client_notes
  for delete to authenticated
  using (public.is_super_admin_safe((select auth.uid())) or public.is_vivacity_team_safe((select auth.uid())));

drop policy if exists tenant_notes_select on public.tenant_notes;
drop policy if exists tenant_notes_insert on public.tenant_notes;
drop policy if exists tenant_notes_update on public.tenant_notes;
drop policy if exists tenant_notes_delete on public.tenant_notes;

create policy tenant_notes_select on public.tenant_notes
  for select to authenticated
  using (public.is_super_admin_safe((select auth.uid())) or public.is_vivacity_team_safe((select auth.uid())));
create policy tenant_notes_insert on public.tenant_notes
  for insert to authenticated
  with check (public.is_super_admin_safe((select auth.uid())) or public.is_vivacity_team_safe((select auth.uid())));
create policy tenant_notes_update on public.tenant_notes
  for update to authenticated
  using (public.is_super_admin_safe((select auth.uid())) or (public.is_vivacity_team_safe((select auth.uid())) and created_by = (select auth.uid())))
  with check (public.is_super_admin_safe((select auth.uid())) or (public.is_vivacity_team_safe((select auth.uid())) and created_by = (select auth.uid())));
create policy tenant_notes_delete on public.tenant_notes
  for delete to authenticated
  using (public.is_super_admin_safe((select auth.uid())) or (public.is_vivacity_team_safe((select auth.uid())) and created_by = (select auth.uid())));

-- ---------------------------------------------------------------------------------------------------------------
-- 2. The client Home feed no longer includes "urgent note" items (they showed the title of an internal pinned note).
--    Same columns and types; the urgent_notes branch is removed, everything else is unchanged.
-- ---------------------------------------------------------------------------------------------------------------

create or replace view public.v_client_home_feed with (security_invoker = true) as
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
           FROM client_action_items cai
          WHERE cai.due_date IS NOT NULL AND cai.completed_at IS NULL AND (COALESCE(cai.status, 'open'::text) <> ALL (ARRAY['completed'::text, 'cancelled'::text])) AND cai.due_date >= now()::date AND cai.due_date < (now() + '84 days'::interval)::date
        ), cai_overdue AS (
         SELECT 'needs_attention'::text AS feed_section,
            'task_overdue'::text AS event_type,
            cai.tenant_id::bigint AS tenant_id,
            cai.package_id AS package_instance_id,
            cai.due_date::timestamp with time zone AS event_at,
            cai.title,
            'Overdue task'::text AS subtitle,
            cai.id::text AS event_uid,
            'client_action_items'::text AS source_table,
            '/client/tasks'::text AS href,
            NULL::text AS package_name
           FROM client_action_items cai
          WHERE cai.due_date IS NOT NULL AND cai.completed_at IS NULL AND (COALESCE(cai.status, 'open'::text) <> ALL (ARRAY['completed'::text, 'cancelled'::text])) AND cai.due_date < now()::date
        ), te_recent AS (
         SELECT 'recent_activity'::text AS feed_section,
            'consult_logged'::text AS event_type,
            pi.tenant_id,
            pi.id AS package_instance_id,
            te.start_at AS event_at,
            COALESCE(NULLIF(TRIM(BOTH FROM te.work_type), ''::text), 'Other'::text) AS title,
            NULLIF(TRIM(BOTH FROM te.work_sub_type), ''::text) AS subtitle,
            te.id::text AS event_uid,
            'time_entries'::text AS source_table,
            '/client/packages'::text AS href,
            COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''::text), p.name) AS package_name
           FROM time_entries te
             JOIN package_instances pi ON pi.id = te.package_instance_id
             JOIN packages p ON p.id = pi.package_id
          WHERE te.duration_minutes IS NOT NULL AND te.duration_minutes > 0 AND te.start_at >= (now() - '30 days'::interval) AND (pi.start_date IS NULL OR te.start_at >= pi.start_date) AND pi.is_complete = false AND te.is_billable = true
        ), stages_completed_recent AS (
         SELECT 'recent_activity'::text AS feed_section,
            'stage_completed'::text AS event_type,
            pi.tenant_id,
            pi.id AS package_instance_id,
            si.status_date AS event_at,
            COALESCE(NULLIF(TRIM(BOTH FROM s.name), ''::text), s.shortname) AS title,
            'Stage complete'::text AS subtitle,
            si.id::text AS event_uid,
            'stage_instances'::text AS source_table,
            '/client/packages'::text AS href,
            COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''::text), p.name) AS package_name
           FROM stage_instances si
             JOIN package_instances pi ON pi.id = si.packageinstance_id
             JOIN packages p ON p.id = pi.package_id
             JOIN stages s ON s.id = si.stage_id
          WHERE (si.status = ANY (ARRAY['completed'::text, 'core_complete'::text])) AND si.status_date IS NOT NULL AND si.status_date >= (now() - '30 days'::interval) AND COALESCE(s.is_archived, false) = false AND COALESCE(s.is_audit_workspace, false) = false AND pi.is_complete = false
        ), cai_completed_recent AS (
         SELECT 'recent_activity'::text AS feed_section,
            'task_completed'::text AS event_type,
            cai.tenant_id::bigint AS tenant_id,
            cai.package_id AS package_instance_id,
            cai.completed_at AS event_at,
            cai.title,
            'Task completed'::text AS subtitle,
            cai.id::text AS event_uid,
            'client_action_items'::text AS source_table,
            '/client/tasks'::text AS href,
            NULL::text AS package_name
           FROM client_action_items cai
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
   FROM ( SELECT cai_due_upcoming.feed_section, cai_due_upcoming.event_type, cai_due_upcoming.tenant_id, cai_due_upcoming.package_instance_id, cai_due_upcoming.event_at, cai_due_upcoming.title, cai_due_upcoming.subtitle, cai_due_upcoming.event_uid, cai_due_upcoming.source_table, cai_due_upcoming.href, cai_due_upcoming.package_name FROM cai_due_upcoming
        UNION ALL
         SELECT cai_overdue.feed_section, cai_overdue.event_type, cai_overdue.tenant_id, cai_overdue.package_instance_id, cai_overdue.event_at, cai_overdue.title, cai_overdue.subtitle, cai_overdue.event_uid, cai_overdue.source_table, cai_overdue.href, cai_overdue.package_name FROM cai_overdue
        UNION ALL
         SELECT te_recent.feed_section, te_recent.event_type, te_recent.tenant_id, te_recent.package_instance_id, te_recent.event_at, te_recent.title, te_recent.subtitle, te_recent.event_uid, te_recent.source_table, te_recent.href, te_recent.package_name FROM te_recent
        UNION ALL
         SELECT stages_completed_recent.feed_section, stages_completed_recent.event_type, stages_completed_recent.tenant_id, stages_completed_recent.package_instance_id, stages_completed_recent.event_at, stages_completed_recent.title, stages_completed_recent.subtitle, stages_completed_recent.event_uid, stages_completed_recent.source_table, stages_completed_recent.href, stages_completed_recent.package_name FROM stages_completed_recent
        UNION ALL
         SELECT cai_completed_recent.feed_section, cai_completed_recent.event_type, cai_completed_recent.tenant_id, cai_completed_recent.package_instance_id, cai_completed_recent.event_at, cai_completed_recent.title, cai_completed_recent.subtitle, cai_completed_recent.event_uid, cai_completed_recent.source_table, cai_completed_recent.href, cai_completed_recent.package_name FROM cai_completed_recent) all_events
  WHERE all_events.event_at IS NOT NULL;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. The client package dashboard no longer returns the pinned note's title, text, priority, updated time or severity.
--    Same columns and types (they are NULL now), so the portal keeps working. The status pill is unchanged: "on hold" is
--    still detected on the server and only the resulting state is returned.
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.get_client_package_dashboard(p_tenant_id bigint, p_package_instance_id bigint DEFAULT NULL::bigint)
 returns table(package_instance_id bigint, tenant_id bigint, package_name text, package_type text, progress_mode text, manager_id uuid, is_complete boolean, start_date date, end_date date, hours_included integer, hours_added integer, hours_total numeric, hours_used numeric, hours_remaining numeric, hours_pct_used numeric, stages_total integer, stages_complete integer, current_stage_sortorder integer, open_tasks integer, overdue_tasks integer, last_activity_at timestamp with time zone, pinned_note_title text, pinned_note_text text, pinned_note_priority text, pinned_note_updated_at timestamp with time zone, pinned_note_severity text, status_pill text, current_stage_shortname text)
 language sql
 stable security definer
 set search_path to ''
 set row_security to 'off'
as $function$
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
           max(te.start_at) AS max_te_at
      FROM public.time_entries te
      JOIN allowed_packages ap ON ap.id = te.package_instance_id
     WHERE te.duration_minutes IS NOT NULL
       AND te.duration_minutes > 0
       AND te.is_billable = true
     GROUP BY te.package_instance_id
  ),
  current_period AS (
    SELECT DISTINCT ON (prp.package_instance_id) prp.package_instance_id, prp.carried_in_minutes
      FROM public.package_renewal_periods prp
     WHERE prp.package_instance_id IN (SELECT id FROM allowed_packages)
       AND prp.closed_at IS NULL
     ORDER BY prp.package_instance_id, prp.period_number DESC
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
         (COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0) + COALESCE(cp.carried_in_minutes,0)/60.0) AS hours_total,
         COALESCE(pi.hours_used,0::numeric) AS hours_used,
         GREATEST((COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0) + COALESCE(cp.carried_in_minutes,0)/60.0)
                  - COALESCE(pi.hours_used,0::numeric), 0::numeric) AS hours_remaining,
         CASE WHEN (COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0) + COALESCE(cp.carried_in_minutes,0)/60.0) = 0 THEN 0::numeric
              ELSE round(COALESCE(pi.hours_used,0::numeric)
                         / (COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0) + COALESCE(cp.carried_in_minutes,0)/60.0), 4)
         END AS hours_pct_used,
         COALESCE(sa.stages_total,0)    AS stages_total,
         COALESCE(sa.stages_complete,0) AS stages_complete,
         sa.current_stage_sortorder,
         COALESCE(ta.open_tasks,0)    AS open_tasks,
         COALESCE(ta.overdue_tasks,0) AS overdue_tasks,
         mra.last_activity_at,
         NULL::text AS pinned_note_title,
         NULL::text AS pinned_note_text,
         NULL::text AS pinned_note_priority,
         NULL::timestamp with time zone AS pinned_note_updated_at,
         NULL::text AS pinned_note_severity,
         CASE
           WHEN pn.pinned_note_text IS NOT NULL
                AND lower((COALESCE(pn.pinned_note_text,'')||' ')||COALESCE(pn.pinned_note_title,'')) LIKE '%on hold%' THEN 'on_hold'
           WHEN pi.is_complete = true THEN 'complete'
           WHEN mra.last_activity_at < (now() - interval '30 days')
                OR ((COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0) + COALESCE(cp.carried_in_minutes,0)/60.0) > 0
                    AND (COALESCE(pi.hours_used,0::numeric)
                         / (COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0) + COALESCE(cp.carried_in_minutes,0)/60.0)) >= 0.95) THEN 'stuck'
           WHEN mra.last_activity_at < (now() - interval '14 days')
                OR ((COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0) + COALESCE(cp.carried_in_minutes,0)/60.0) > 0
                    AND (COALESCE(pi.hours_used,0::numeric)
                         / (COALESCE(p.total_hours,0) + COALESCE(pi.hours_added,0) + COALESCE(cp.carried_in_minutes,0)/60.0)) >= 0.75)
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
    LEFT JOIN current_period cp         ON cp.package_instance_id = pi.id
    LEFT JOIN most_recent_activity mra  ON mra.package_instance_id = pi.id
$function$;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. The client "recent work" list no longer returns staff free-text time-entry notes (the column stays, as NULL).
-- ---------------------------------------------------------------------------------------------------------------

create or replace function public.get_client_package_hours_recent(p_tenant_id bigint, p_package_instance_id bigint)
 returns table(entry_id uuid, package_instance_id bigint, tenant_id bigint, occurred_at timestamp with time zone, duration_minutes integer, hours numeric, work_type text, work_sub_type text, notes text, rank_in_package bigint, is_billable boolean)
 language sql
 stable security definer
 set search_path to ''
 set row_security to 'off'
as $function$
  WITH entries AS (
    SELECT
      te.id AS entry_id,
      tea.package_instance_id,
      pi.tenant_id::bigint AS tenant_id,
      te.start_at AS occurred_at,
      tea.allocated_minutes AS duration_minutes,
      te.work_type,
      te.work_sub_type,
      te.is_billable
    FROM public.time_entry_allocations tea
    JOIN public.time_entries te ON te.id = tea.time_entry_id
    JOIN public.package_instances pi ON pi.id = tea.package_instance_id
    WHERE pi.id = p_package_instance_id
      AND pi.tenant_id = p_tenant_id
      AND app.user_can_access_tenant(p_tenant_id)
      AND te.duration_minutes IS NOT NULL AND te.duration_minutes > 0
      AND te.work_type <> 'carry_over'
      AND te.start_at >= COALESCE(pi.start_renewal_date::timestamp, pi.start_date::timestamp)
      AND te.start_at <  COALESCE(pi.next_renewal_date::timestamp, pi.start_date + interval '1 year')

    UNION ALL

    SELECT
      te.id,
      te.package_instance_id,
      pi.tenant_id::bigint,
      te.start_at,
      te.duration_minutes,
      te.work_type,
      te.work_sub_type,
      te.is_billable
    FROM public.time_entries te
    JOIN public.package_instances pi ON pi.id = te.package_instance_id
    WHERE pi.id = p_package_instance_id
      AND pi.tenant_id = p_tenant_id
      AND app.user_can_access_tenant(p_tenant_id)
      AND te.duration_minutes IS NOT NULL AND te.duration_minutes > 0
      AND te.work_type <> 'carry_over'
      AND NOT EXISTS (SELECT 1 FROM public.time_entry_allocations tea2 WHERE tea2.time_entry_id = te.id)
      AND te.start_at >= COALESCE(pi.start_renewal_date::timestamp, pi.start_date::timestamp)
      AND te.start_at <  COALESCE(pi.next_renewal_date::timestamp, pi.start_date + interval '1 year')
  )
  SELECT
    e.entry_id,
    e.package_instance_id,
    e.tenant_id,
    e.occurred_at,
    e.duration_minutes,
    round(e.duration_minutes::numeric / 60.0, 2) AS hours,
    COALESCE(NULLIF(TRIM(e.work_type), ''), 'Other') AS work_type,
    NULLIF(TRIM(e.work_sub_type), '') AS work_sub_type,
    NULL::text AS notes,
    row_number() OVER (ORDER BY e.occurred_at DESC NULLS LAST, e.entry_id DESC) AS rank_in_package,
    e.is_billable
  FROM entries e
  ORDER BY rank_in_package;
$function$;
