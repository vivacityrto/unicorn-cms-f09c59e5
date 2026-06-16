-- ============================================================
-- Phase 4 · rpc_publish_stage_tasks
-- ============================================================
-- PRE-DEPLOY VERIFICATION (run manually before applying)
--
-- §3.a column shape on client_action_items
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='client_action_items'
--    ORDER BY ordinal_position;
--
-- §3.b is_vivacity_team_safe exists
--   SELECT proname FROM pg_proc
--    WHERE proname='is_vivacity_team_safe' AND pronamespace='public'::regnamespace;
--
-- §3.c dd_action_status('todo') and dd_priority('medium') present
--   SELECT value FROM public.dd_action_status WHERE value='todo';
--   SELECT value FROM public.dd_priority      WHERE value='medium';
--
-- §3.d FK client_task_instances_published_action_item_id_fkey present
--   SELECT conname FROM pg_constraint
--    WHERE conrelid='public.client_task_instances'::regclass
--      AND conname LIKE '%published_action_item%';
--
-- §3.e baseline counts on the chosen test stage instance :sid
--   SELECT count(*) FILTER (WHERE published_action_item_id IS NULL AND is_archived=false) AS unpublished,
--          count(*) FILTER (WHERE published_action_item_id IS NOT NULL)                   AS already_published,
--          count(*) FILTER (WHERE is_archived)                                            AS archived
--     FROM public.client_task_instances WHERE stageinstance_id = :sid;
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_publish_stage_tasks(p_stage_instance_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
  cti             record;
BEGIN
  -- Auth gate: staff-only
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_vivacity_team_safe(v_uid) THEN
    RAISE EXCEPTION 'Vivacity staff only' USING ERRCODE = '42501';
  END IF;

  -- Resolve stage instance context
  SELECT si.stage_id, si.packageinstance_id, pi.tenant_id, pi.package_id
    INTO v_stage_id, v_pkg_inst_id, v_tenant_id, v_package_id
    FROM public.stage_instances si
    JOIN public.package_instances pi ON pi.id = si.packageinstance_id
   WHERE si.id = p_stage_instance_id;

  IF v_stage_id IS NULL THEN
    RAISE EXCEPTION 'Stage instance % not found', p_stage_instance_id USING ERRCODE = 'P0002';
  END IF;

  -- client_id is the canonical tenant id stringified for client_action_items.client_id (text)
  v_client_id := v_tenant_id::text;

  -- Convert each unpublished, non-archived CTI into a client_action_items row
  FOR cti IN
    SELECT cti.id, cti.due_date, ct.name, ct.description, ct.sort_order
      FROM public.client_task_instances cti
      JOIN public.client_tasks          ct  ON ct.id = cti.clienttask_id
     WHERE cti.stageinstance_id           = p_stage_instance_id
       AND cti.published_action_item_id   IS NULL
       AND cti.is_archived                = false
     ORDER BY ct.sort_order NULLS LAST, cti.id
     FOR UPDATE OF cti
  LOOP
    INSERT INTO public.client_action_items (
      tenant_id,
      client_id,
      created_by,
      title,
      description,
      due_date,
      status,
      priority,
      source,
      item_type,
      related_entity_type,
      related_entity_id,
      package_id,
      stage_id,
      sort_order
    ) VALUES (
      v_tenant_id::integer,
      v_client_id,
      v_uid,
      cti.name,
      cti.description,
      cti.due_date::date,
      'todo',
      'medium',
      'stage_rule',
      'client',
      'stage_task',
      cti.id::text,
      v_package_id,
      v_stage_id::bigint,
      COALESCE(cti.sort_order, 0)
    )
    RETURNING id INTO v_action_id;
    -- NOTE: trg_action_item_timeline auto-inserts client_timeline_events here.
    -- Do NOT manually insert a timeline event.
    -- (Phase 5 cleanup B1: rpc_create_action_item double-inserts timeline events; not touched here.)

    UPDATE public.client_task_instances
       SET published_action_item_id = v_action_id,
           updated_at               = now()
     WHERE id = cti.id;

    v_published  := v_published + 1;
    v_action_ids := v_action_ids || v_action_id;
  END LOOP;

  -- D1: skipped = every CTI on the stage that now has a back-pointer (incl. archived),
  --     minus the rows we just published this call.
  SELECT count(*)::integer
    INTO v_skipped
    FROM public.client_task_instances
   WHERE stageinstance_id = p_stage_instance_id
     AND published_action_item_id IS NOT NULL;
  v_skipped := v_skipped - v_published;

  -- D4: audit row to client_audit_log (entity_id is text → accepts bigint stage id)
  INSERT INTO public.client_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, details
  ) VALUES (
    v_tenant_id,
    v_uid,
    'publish_stage_tasks',
    'stage_instance',
    p_stage_instance_id::text,
    jsonb_build_object(
      'stage_instance_id', p_stage_instance_id,
      'stage_id',          v_stage_id,
      'package_instance_id', v_pkg_inst_id,
      'published_count',   v_published,
      'skipped_count',     v_skipped,
      'action_item_ids',   to_jsonb(v_action_ids)
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
REVOKE ALL ON FUNCTION public.rpc_publish_stage_tasks(integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.rpc_publish_stage_tasks(integer) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.rpc_publish_stage_tasks(integer) TO service_role;

COMMENT ON FUNCTION public.rpc_publish_stage_tasks(integer) IS
  'Phase 4: converts unpublished client_task_instances for a stage instance into client_action_items. Staff-only. Idempotent via published_action_item_id back-pointer.';

-- ============================================================
-- POST-DEPLOY VERIFICATION (run manually after applying)
--
-- §4.a SECURITY DEFINER + locked search_path
--   SELECT proname, prosecdef, proconfig
--     FROM pg_proc
--    WHERE proname='rpc_publish_stage_tasks' AND pronamespace='public'::regnamespace;
--   -- Expect prosecdef=true, proconfig contains 'search_path='
--
-- §4.b grants restricted to authenticated + service_role
--   SELECT grantee, privilege_type
--     FROM information_schema.routine_privileges
--    WHERE specific_schema='public' AND routine_name='rpc_publish_stage_tasks';
--   -- Expect only authenticated, service_role
--
-- §4.c empty-stage smoke test
--   SELECT public.rpc_publish_stage_tasks(:empty_sid);
--   -- Expect published_count=0, skipped_count=0
--
-- §4.d populated-stage call
--   SELECT public.rpc_publish_stage_tasks(:sid);
--   -- Expect published_count > 0
--
-- §4.e CTI ↔ CAI mapping
--   SELECT cti.id, cti.published_action_item_id, cai.source, cai.item_type,
--          cai.status, cai.related_entity_type, cai.related_entity_id
--     FROM public.client_task_instances cti
--     JOIN public.client_action_items    cai ON cai.id = cti.published_action_item_id
--    WHERE cti.stageinstance_id = :sid;
--
-- §4.f idempotency (second call)
--   SELECT public.rpc_publish_stage_tasks(:sid);
--   -- Expect published_count=0, skipped_count=N
--
-- §4.g exactly one timeline event per CAI
--   SELECT cai.id, count(te.*) AS events
--     FROM public.client_action_items cai
--     LEFT JOIN public.client_timeline_events te
--            ON te.related_entity_type='client_action_item' AND te.related_entity_id = cai.id::text
--    WHERE cai.id = ANY ( (SELECT (jsonb_array_elements_text(details->'action_item_ids'))::uuid
--                            FROM public.client_audit_log
--                           WHERE action='publish_stage_tasks' AND entity_id = :sid::text
--                           ORDER BY created_at DESC LIMIT 1) )
--    GROUP BY cai.id;
--   -- Expect events=1 per row
--
-- §4.h audit row present
--   SELECT action, entity_type, entity_id, details->'published_count', details->'skipped_count'
--     FROM public.client_audit_log
--    WHERE action='publish_stage_tasks' AND entity_id = :sid::text
--    ORDER BY created_at DESC LIMIT 1;
--
-- §4.i portal user invocation rejected
--   -- (Using a JWT for a portal user)
--   SELECT public.rpc_publish_stage_tasks(:sid);
--   -- Expect SQLSTATE 42501
-- ============================================================