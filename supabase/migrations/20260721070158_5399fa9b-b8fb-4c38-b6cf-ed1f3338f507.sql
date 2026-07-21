CREATE OR REPLACE FUNCTION public.start_client_package(p_tenant_id bigint, p_package_id bigint, p_assigned_csc_user_id uuid DEFAULT NULL::uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_package_instance_id bigint;
  v_included_minutes integer;
  v_pkg_type text;
  v_pkg_name text;
  v_pkg_slug text;
  v_stream text;
  v_existing_name text;
  v_existing_stream text;
  v_billing_type text;
  v_billing_category text;
  v_stage RECORD;
  v_stage_instance_id bigint;
BEGIN
  PERFORM set_config('app.skip_stage_seed', 'on', true);

  SELECT COALESCE(total_hours, 0) * 60, package_type, name, slug
    INTO v_included_minutes, v_pkg_type, v_pkg_name, v_pkg_slug
    FROM public.packages
   WHERE id = p_package_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package % not found', p_package_id;
  END IF;

  v_stream := public.fn_package_stream(p_package_id);

  IF v_pkg_name LIKE 'KS%' OR v_pkg_name LIKE 'KickStart%' OR v_pkg_slug LIKE '%ks%' THEN
    v_billing_type := 'non_billable'; v_billing_category := NULL;
  ELSIF v_pkg_name LIKE 'M-GTO%' THEN
    v_billing_type := 'billable'; v_billing_category := 'other';
  ELSIF v_pkg_name LIKE 'M-%' AND (
      v_pkg_slug LIKE '%-rc' OR v_pkg_slug LIKE '%-gc'
      OR v_pkg_slug LIKE '%-dc' OR v_pkg_slug LIKE '%-sac'
      OR v_pkg_slug LIKE '%-bc'
  ) THEN
    v_billing_type := 'billable'; v_billing_category := 'membership_cricos';
  ELSIF v_pkg_name LIKE 'M-%' THEN
    v_billing_type := 'billable'; v_billing_category := 'membership_rto';
  ELSE
    v_billing_type := 'billable'; v_billing_category := 'other';
  END IF;

  SELECT p.name, public.fn_package_stream(p.id)
    INTO v_existing_name, v_existing_stream
    FROM public.package_instances pi
    JOIN public.packages p ON p.id = pi.package_id
   WHERE pi.tenant_id = p_tenant_id
     AND pi.is_complete = false
     AND pi.parent_instance_id IS NULL
     AND COALESCE(pi.membership_state, 'active') <> 'cancelled'
     AND p.package_type = v_pkg_type
     AND (
           public.fn_package_stream(p.id) = 'generic'
        OR v_stream = 'generic'
        OR public.fn_package_stream(p.id) = v_stream
     )
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'DUPLICATE_PACKAGE_TYPE: tenant % already has an active % (% stream) package: %. Cancel or complete it first.',
      p_tenant_id, v_pkg_type, v_existing_stream, v_existing_name
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.package_instances (
    tenant_id, package_id, start_date, is_complete, is_active, clo_id,
    manager_id, included_minutes, billing_type, billing_category
  ) VALUES (
    p_tenant_id, p_package_id, CURRENT_DATE, false, true, 0,
    p_assigned_csc_user_id, v_included_minutes, v_billing_type, v_billing_category
  )
  RETURNING id INTO v_package_instance_id;

  FOR v_stage IN
    SELECT ps.stage_id, ps.sort_order, ps.is_recurring
      FROM public.package_stages ps
     WHERE ps.package_id = p_package_id
     ORDER BY ps.sort_order
  LOOP
    INSERT INTO public.stage_instances (
      stage_id, packageinstance_id, stage_sortorder, status, is_recurring
    ) VALUES (
      v_stage.stage_id::integer, v_package_instance_id, v_stage.sort_order,
      'not_started', v_stage.is_recurring
    )
    RETURNING id INTO v_stage_instance_id;

    INSERT INTO public.staff_task_instances (stafftask_id, stageinstance_id, status_id, status)
    SELECT st.id, v_stage_instance_id, 0, 'not_started'
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
    SELECT d.id, v_stage_instance_id, p_tenant_id, 'pending', false
      FROM public.documents d
     WHERE d.stage = v_stage.stage_id::integer
        OR EXISTS (
          SELECT 1 FROM public.document_stage_links dsl
          WHERE dsl.document_id = d.id
            AND dsl.stage_id = v_stage.stage_id::integer
        );
  END LOOP;

  INSERT INTO public.client_audit_log (
    tenant_id, actor_user_id, action, entity_type, entity_id, after_data
  ) VALUES (
    p_tenant_id, auth.uid(), 'package_started', 'package_instances',
    v_package_instance_id::text,
    jsonb_build_object(
      'package_id', p_package_id,
      'assigned_csc_user_id', p_assigned_csc_user_id,
      'stream', v_stream,
      'billing_type', v_billing_type,
      'billing_category', v_billing_category
    )
  );

  RETURN v_package_instance_id;
END;
$function$