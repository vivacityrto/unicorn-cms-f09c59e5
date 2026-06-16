
-- ============================================================
-- Phase 5 / Step 1 — schema
-- ============================================================
ALTER TABLE public.client_action_items
  ADD COLUMN package_instance_id bigint NULL
    REFERENCES public.package_instances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cai_package_instance_id
  ON public.client_action_items(package_instance_id)
  WHERE package_instance_id IS NOT NULL;

COMMENT ON COLUMN public.client_action_items.package_instance_id IS
  'Phase 5: canonical link to package_instances(id). Use this for dashboard / portal scoping. package_id (template FK) retained for back-compat; do not use for instance scoping.';

COMMENT ON COLUMN public.stage_instances.released_client_tasks IS
  'Deprecated Phase 5 — do not use. Replaced by per-action-item publication via rpc_publish_stage_tasks. Column retained inert pending Phase 6 cleanup.';

-- ============================================================
-- Phase 5 / Step 2 — backfill
-- ============================================================
UPDATE public.client_action_items cai
   SET package_instance_id = si.packageinstance_id
  FROM public.client_task_instances cti
  JOIN public.stage_instances si ON si.id = cti.stageinstance_id
 WHERE cai.related_entity_type = 'stage_task'
   AND cai.related_entity_id   = cti.id::text
   AND cai.package_instance_id IS NULL;

-- ============================================================
-- Phase 5 / Step 3 — rpc_publish_stage_tasks (adds package_instance_id)
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_publish_stage_tasks(p_stage_instance_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid           uuid := auth.uid();
  v_stage_id      integer;
  v_pkg_inst_id   bigint;
  v_tenant_id     bigint;
  v_package_id    bigint;
  v_client_id     text;
  v_action_id     uuid;
  v_published     integer := 0;
  v_skipped       integer := 0;
  v_action_ids    uuid[] := ARRAY[]::uuid[];
  r               record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_vivacity_team_safe(v_uid) THEN
    RAISE EXCEPTION 'Vivacity staff only' USING ERRCODE = '42501';
  END IF;

  SELECT si.stage_id, si.packageinstance_id, pi.tenant_id, pi.package_id
    INTO v_stage_id, v_pkg_inst_id, v_tenant_id, v_package_id
    FROM public.stage_instances si
    JOIN public.package_instances pi ON pi.id = si.packageinstance_id
   WHERE si.id = p_stage_instance_id;

  IF v_stage_id IS NULL THEN
    RAISE EXCEPTION 'Stage instance % not found', p_stage_instance_id USING ERRCODE = 'P0002';
  END IF;

  v_client_id := v_tenant_id::text;

  FOR r IN
    SELECT cti.id, cti.due_date, ct.name, ct.description, ct.sort_order
      FROM public.client_task_instances cti
      JOIN public.client_tasks          ct  ON ct.id = cti.clienttask_id
     WHERE cti.stageinstance_id           = p_stage_instance_id
       AND cti.published_action_item_id   IS NULL
       AND cti.is_archived                = false
     ORDER BY ct.sort_order NULLS LAST, cti.id
     FOR UPDATE
  LOOP
    INSERT INTO public.client_action_items (
      tenant_id, client_id, created_by, title, description, due_date,
      status, priority, source, item_type, related_entity_type,
      related_entity_id, package_id, package_instance_id, sort_order
    ) VALUES (
      v_tenant_id::integer, v_client_id, v_uid, r.name, r.description, r.due_date::date,
      'todo', 'medium', 'stage_rule', 'client', 'stage_task',
      r.id::text, v_package_id, v_pkg_inst_id, COALESCE(r.sort_order, 0)
    )
    RETURNING id INTO v_action_id;

    UPDATE public.client_task_instances
       SET published_action_item_id = v_action_id,
           updated_at               = now()
     WHERE id = r.id;

    v_published  := v_published + 1;
    v_action_ids := v_action_ids || v_action_id;
  END LOOP;

  SELECT count(*)::integer
    INTO v_skipped
    FROM public.client_task_instances
   WHERE stageinstance_id = p_stage_instance_id
     AND published_action_item_id IS NOT NULL;
  v_skipped := v_skipped - v_published;

  INSERT INTO public.client_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, details
  ) VALUES (
    v_tenant_id, v_uid, 'publish_stage_tasks', 'stage_instance', p_stage_instance_id::text,
    jsonb_build_object(
      'stage_instance_id',   p_stage_instance_id,
      'stage_id',            v_stage_id,
      'package_instance_id', v_pkg_inst_id,
      'published_count',     v_published,
      'skipped_count',       v_skipped,
      'action_item_ids',     to_jsonb(v_action_ids)
    )
  );

  RETURN jsonb_build_object(
    'success',           true,
    'stage_instance_id', p_stage_instance_id,
    'published_count',   v_published,
    'skipped_count',     v_skipped,
    'action_item_ids',   to_jsonb(v_action_ids)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_publish_stage_tasks(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_publish_stage_tasks(integer) TO authenticated, service_role;

-- ============================================================
-- Phase 5 / Step 4 — rpc_create_action_item (adds p_package_instance_id)
-- ============================================================
DROP FUNCTION IF EXISTS public.rpc_create_action_item(
  integer, text, text, text, uuid, date, text, text, uuid, text, text, text
);

CREATE OR REPLACE FUNCTION public.rpc_create_action_item(
  p_tenant_id            integer,
  p_client_id            text,
  p_title                text,
  p_description          text DEFAULT NULL,
  p_owner_user_id        uuid DEFAULT NULL,
  p_due_date             date DEFAULT NULL,
  p_priority             text DEFAULT 'medium',
  p_source               text DEFAULT 'manual',
  p_source_note_id       uuid DEFAULT NULL,
  p_related_entity_type  text DEFAULT NULL,
  p_related_entity_id    text DEFAULT NULL,
  p_recurrence_rule      text DEFAULT NULL,
  p_package_instance_id  bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id   uuid;
  v_action_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  IF p_title IS NULL OR trim(p_title) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Title is required');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.dd_priority WHERE value = p_priority AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid priority');
  END IF;

  IF p_source NOT IN ('manual', 'note', 'stage_rule', 'system', 'task_assignment') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid source');
  END IF;

  INSERT INTO public.client_action_items (
    tenant_id, client_id, created_by, title, description, owner_user_id,
    due_date, priority, source, source_note_id, related_entity_type,
    related_entity_id, recurrence_rule, package_instance_id
  ) VALUES (
    p_tenant_id, p_client_id, v_user_id, p_title, p_description, p_owner_user_id,
    p_due_date, p_priority, p_source, p_source_note_id, p_related_entity_type,
    p_related_entity_id, p_recurrence_rule, p_package_instance_id
  )
  RETURNING id INTO v_action_id;

  RETURN jsonb_build_object('success', true, 'action_item_id', v_action_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_create_action_item(
  integer, text, text, text, uuid, date, text, text, uuid, text, text, text, bigint
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_create_action_item(
  integer, text, text, text, uuid, date, text, text, uuid, text, text, text, bigint
) TO authenticated, service_role;

-- ============================================================
-- Phase 5 / Step 5 — dashboard views + RPC (cai.package_id -> cai.package_instance_id)
-- ============================================================

-- (A) get_client_package_dashboard
CREATE OR REPLACE FUNCTION public.get_client_package_dashboard(
  p_tenant_id bigint, p_package_instance_id bigint DEFAULT NULL::bigint
)
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
       AND cti.published_action_item_id IS NULL
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

REVOKE ALL ON FUNCTION public.get_client_package_dashboard(bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_client_package_dashboard(bigint, bigint) TO authenticated, service_role;

-- (B) v_client_package_dashboard
CREATE OR REPLACE VIEW public.v_client_package_dashboard AS
WITH stage_agg AS (
         SELECT si.packageinstance_id AS package_instance_id,
            count(*)::integer AS stages_total,
            count(*) FILTER (WHERE si.status_id = ANY (ARRAY[2, 3]))::integer AS stages_complete,
            min(si.stage_sortorder) FILTER (WHERE si.status_id IS NULL OR (si.status_id <> ALL (ARRAY[2, 3]))) AS current_stage_sortorder,
            max(si.updated_at) AS stage_last_updated
           FROM stage_instances si
             JOIN package_instances pi_1 ON pi_1.id = si.packageinstance_id
          WHERE app.user_can_access_tenant(pi_1.tenant_id)
          GROUP BY si.packageinstance_id
        ), current_stage AS (
         SELECT DISTINCT ON (si.packageinstance_id) si.packageinstance_id,
            COALESCE(NULLIF(TRIM(BOTH FROM s.shortname), ''::text), s.name) AS shortname
           FROM stage_instances si
             JOIN stages s ON s.id = si.stage_id
             JOIN package_instances pi_1 ON pi_1.id = si.packageinstance_id
          WHERE (si.status_id IS NULL OR (si.status_id <> ALL (ARRAY[2, 3]))) AND COALESCE(s.is_archived, false) = false AND COALESCE(s.is_audit_workspace, false) = false AND app.user_can_access_tenant(pi_1.tenant_id)
          ORDER BY si.packageinstance_id, si.stage_sortorder
        ), action_items_agg AS (
         SELECT cai.package_instance_id AS package_instance_id,
            count(*)::integer AS open_count,
            count(*) FILTER (WHERE cai.due_date < now()::date)::integer AS overdue_count,
            max(cai.updated_at) AS last_updated
           FROM client_action_items cai
          WHERE cai.package_instance_id IS NOT NULL AND cai.completed_at IS NULL AND (COALESCE(cai.status, 'open'::text) <> ALL (ARRAY['completed'::text, 'cancelled'::text])) AND app.user_can_access_tenant(cai.tenant_id::bigint)
          GROUP BY cai.package_instance_id
        ), task_instances_agg AS (
         SELECT si.packageinstance_id AS package_instance_id,
            count(*)::integer AS open_count,
            count(*) FILTER (WHERE cti.due_date < now())::integer AS overdue_count,
            max(cti.updated_at) AS last_updated
           FROM client_task_instances cti
             JOIN stage_instances si ON si.id = cti.stageinstance_id
             JOIN package_instances pi_1 ON pi_1.id = si.packageinstance_id
          WHERE COALESCE(cti.is_archived, false) = false AND cti.completion_date IS NULL AND COALESCE(cti.status, 0) <> 2 AND COALESCE(si.released_client_tasks, false) = true AND cti.published_action_item_id IS NULL AND app.user_can_access_tenant(pi_1.tenant_id)
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
          WHERE n.parent_type = 'package_instance'::text AND n.parent_id IS NOT NULL AND app.user_can_access_tenant(n.tenant_id)
          GROUP BY n.parent_id
        ), pinned AS (
         SELECT DISTINCT ON (n.parent_id) n.parent_id AS package_instance_id,
            n.title AS pinned_note_title,
            n.note_details AS pinned_note_text,
            n.priority AS pinned_note_priority,
            n.updated_at AS pinned_note_updated_at
           FROM notes n
          WHERE n.parent_type = 'package_instance'::text AND n.is_pinned = true AND n.parent_id IS NOT NULL AND app.user_can_access_tenant(n.tenant_id)
          ORDER BY n.parent_id, n.updated_at DESC NULLS LAST
        ), hours_agg AS (
         SELECT te.package_instance_id,
            COALESCE(sum(te.duration_minutes), 0::bigint)::numeric / 60.0 AS hours_used_calc,
            max(te.start_at) AS max_te_at
           FROM time_entries te
             JOIN package_instances pi2 ON pi2.id = te.package_instance_id
          WHERE te.package_instance_id IS NOT NULL AND te.duration_minutes IS NOT NULL AND te.duration_minutes > 0 AND (pi2.start_date IS NULL OR te.start_at >= pi2.start_date) AND app.user_can_access_tenant(pi2.tenant_id) AND te.is_billable = true
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
            WHEN pi.is_complete = true THEN 'complete'
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

-- (C) v_client_package_whats_next
CREATE OR REPLACE VIEW public.v_client_package_whats_next AS
WITH combined AS (
         SELECT cai.package_instance_id AS package_instance_id,
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
           FROM client_action_items cai
          WHERE cai.completed_at IS NULL AND (cai.status IS NULL OR (cai.status <> ALL (ARRAY['completed'::text, 'cancelled'::text])))
        UNION ALL
         SELECT si.packageinstance_id AS package_instance_id,
            pi.tenant_id,
            cti.id::text AS task_uid,
            'task_instance'::text AS source,
            COALESCE(ct.name, 'Task #'::text || cti.id::text) AS title,
            ct.description,
            cti.due_date AS due_at,
            NULL::text AS priority,
            cti.created_at,
            cti.updated_at,
            NULL::text AS recurrence_rule,
            NULL::text AS item_type
           FROM client_task_instances cti
             JOIN stage_instances si ON si.id = cti.stageinstance_id
             JOIN package_instances pi ON pi.id = si.packageinstance_id
             LEFT JOIN client_tasks ct ON ct.id = cti.clienttask_id
          WHERE COALESCE(cti.is_archived, false) = false AND cti.completion_date IS NULL AND COALESCE(si.released_client_tasks, false) = true AND cti.published_action_item_id IS NULL
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

-- ============================================================
-- Phase 5 / Step 6 — backfill RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_backfill_released_stage_tasks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_uid             uuid := auth.uid();
  v_stage_inst_id   bigint;
  v_stage_result    jsonb;
  v_stages_run      integer := 0;
  v_total_published integer := 0;
  v_total_skipped   integer := 0;
  v_results         jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_vivacity_team_safe(v_uid) THEN
    RAISE EXCEPTION 'Vivacity staff only' USING ERRCODE = '42501';
  END IF;

  FOR v_stage_inst_id IN
    SELECT DISTINCT si.id
      FROM public.stage_instances si
      JOIN public.client_task_instances cti ON cti.stageinstance_id = si.id
     WHERE si.released_client_tasks = true
       AND cti.published_action_item_id IS NULL
       AND COALESCE(cti.is_archived, false) = false
     ORDER BY si.id
  LOOP
    v_stage_result := public.rpc_publish_stage_tasks(v_stage_inst_id::integer);
    v_stages_run      := v_stages_run + 1;
    v_total_published := v_total_published + COALESCE((v_stage_result->>'published_count')::integer, 0);
    v_total_skipped   := v_total_skipped   + COALESCE((v_stage_result->>'skipped_count')::integer,   0);
    v_results         := v_results || jsonb_build_array(v_stage_result);
  END LOOP;

  INSERT INTO public.client_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, details
  ) VALUES (
    NULL, v_uid, 'backfill_released_stage_tasks', 'system', NULL,
    jsonb_build_object(
      'stages_run',      v_stages_run,
      'total_published', v_total_published,
      'total_skipped',   v_total_skipped
    )
  );

  RETURN jsonb_build_object(
    'success',         true,
    'stages_run',      v_stages_run,
    'total_published', v_total_published,
    'total_skipped',   v_total_skipped,
    'per_stage',       v_results
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_backfill_released_stage_tasks() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_backfill_released_stage_tasks() TO authenticated, service_role;
