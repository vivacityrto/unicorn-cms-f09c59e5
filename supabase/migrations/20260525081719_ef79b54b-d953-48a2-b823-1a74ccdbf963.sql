CREATE OR REPLACE FUNCTION public.repair_package_instance_stages(
  p_package_instance_id bigint,
  p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pkg_id bigint;
  v_tenant_id bigint;
  v_template_total int;
  v_present int;
  v_stage RECORD;
  v_stage_instance_id bigint;
  v_inserted_ids bigint[] := ARRAY[]::bigint[];
  v_missing jsonb := '[]'::jsonb;
BEGIN
  -- Staff-only guard
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'insufficient_privilege: staff-only operation' USING ERRCODE = '42501';
  END IF;

  SELECT pi.package_id, pi.tenant_id
    INTO v_pkg_id, v_tenant_id
    FROM public.package_instances pi
   WHERE pi.id = p_package_instance_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'package_instance % not found', p_package_instance_id;
  END IF;

  SELECT count(*) INTO v_template_total
    FROM public.package_stages ps
   WHERE ps.package_id = v_pkg_id;

  SELECT count(*) INTO v_present
    FROM public.stage_instances si
   WHERE si.packageinstance_id = p_package_instance_id;

  -- Build missing diagnostic list
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'stage_id', ps.stage_id,
           'name', s.name,
           'sort_order', ps.sort_order
         ) ORDER BY ps.sort_order), '[]'::jsonb)
    INTO v_missing
    FROM public.package_stages ps
    LEFT JOIN public.stages s ON s.id = ps.stage_id::int
   WHERE ps.package_id = v_pkg_id
     AND NOT EXISTS (
       SELECT 1 FROM public.stage_instances si
        WHERE si.packageinstance_id = p_package_instance_id
          AND si.stage_id = ps.stage_id::int
     );

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'package_instance_id', p_package_instance_id,
      'package_id', v_pkg_id,
      'tenant_id', v_tenant_id,
      'template_total', v_template_total,
      'present', v_present,
      'missing', v_missing,
      'dry_run', true
    );
  END IF;

  -- Insert missing stages + seed children (mirrors start_client_package)
  FOR v_stage IN
    SELECT ps.stage_id, ps.sort_order, ps.is_recurring
      FROM public.package_stages ps
     WHERE ps.package_id = v_pkg_id
       AND NOT EXISTS (
         SELECT 1 FROM public.stage_instances si
          WHERE si.packageinstance_id = p_package_instance_id
            AND si.stage_id = ps.stage_id::int
       )
     ORDER BY ps.sort_order
  LOOP
    INSERT INTO public.stage_instances (
      stage_id, packageinstance_id, stage_sortorder, status_id, status, is_recurring
    ) VALUES (
      v_stage.stage_id::integer, p_package_instance_id, v_stage.sort_order, 0, 'Not Started', v_stage.is_recurring
    )
    RETURNING id INTO v_stage_instance_id;

    v_inserted_ids := v_inserted_ids || v_stage_instance_id;

    INSERT INTO public.staff_task_instances (stafftask_id, stageinstance_id, status_id, status)
    SELECT st.id, v_stage_instance_id, 0, 'Not Started'
      FROM public.staff_tasks st
     WHERE st.stage_id = v_stage.stage_id::integer;

    INSERT INTO public.client_task_instances (clienttask_id, stageinstance_id, status, due_date)
    SELECT ct.id, v_stage_instance_id, 0,
           CASE WHEN ct.due_date_offset IS NOT NULL
                THEN (CURRENT_DATE + ct.due_date_offset * INTERVAL '1 day')
                ELSE NULL
           END
      FROM public.client_tasks ct
     WHERE ct.stage_id = v_stage.stage_id::integer;

    INSERT INTO public.email_instances (email_id, stageinstance_id, subject, content, is_sent, user_attachments)
    SELECT e.id, v_stage_instance_id, e.subject, e.content, false, ''
      FROM public.emails e
     WHERE e.stage_id = v_stage.stage_id::integer;

    INSERT INTO public.document_instances (document_id, stageinstance_id, tenant_id, status, isgenerated)
    SELECT d.id, v_stage_instance_id, v_tenant_id, 'pending', false
      FROM public.documents d
     WHERE d.stage = v_stage.stage_id::integer;
  END LOOP;

  INSERT INTO public.client_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) VALUES (
    v_tenant_id, auth.uid(), 'package_stages_repaired', 'package_instances',
    p_package_instance_id::text,
    jsonb_build_object(
      'inserted_stage_instance_ids', v_inserted_ids,
      'inserted_count', array_length(v_inserted_ids, 1),
      'template_total', v_template_total,
      'missing_before', v_missing
    )
  );

  RETURN jsonb_build_object(
    'package_instance_id', p_package_instance_id,
    'package_id', v_pkg_id,
    'tenant_id', v_tenant_id,
    'template_total', v_template_total,
    'inserted_count', COALESCE(array_length(v_inserted_ids, 1), 0),
    'inserted_stage_instance_ids', v_inserted_ids,
    'dry_run', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.repair_package_instance_stages(bigint, boolean) TO authenticated;