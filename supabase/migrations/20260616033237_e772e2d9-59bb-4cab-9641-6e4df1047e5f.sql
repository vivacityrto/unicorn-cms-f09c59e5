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
      related_entity_id, package_id, sort_order
    ) VALUES (
      v_tenant_id::integer, v_client_id, v_uid, r.name, r.description, r.due_date::date,
      'todo', 'medium', 'stage_rule', 'client', 'stage_task',
      r.id::text, v_package_id, COALESCE(r.sort_order, 0)
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