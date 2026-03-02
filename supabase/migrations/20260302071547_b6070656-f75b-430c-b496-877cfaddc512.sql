CREATE OR REPLACE FUNCTION public.start_client_package(p_tenant_id bigint, p_package_id bigint, p_assigned_csc_user_id uuid DEFAULT NULL::uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_package_instance_id bigint;
  v_included_minutes integer;
  v_stage RECORD;
  v_stage_instance_id bigint;
BEGIN
  -- Get included minutes from package template
  SELECT COALESCE(total_hours, 0) * 60
    INTO v_included_minutes
    FROM packages
   WHERE id = p_package_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package % not found', p_package_id;
  END IF;

  -- 1. Insert into package_instances
  INSERT INTO package_instances (
    tenant_id,
    package_id,
    start_date,
    is_complete,
    is_active,
    clo_id,
    manager_id,
    included_minutes
  ) VALUES (
    p_tenant_id,
    p_package_id,
    CURRENT_DATE,
    false,
    true,
    0,
    p_assigned_csc_user_id,
    v_included_minutes
  )
  RETURNING id INTO v_package_instance_id;

  -- 2. Loop through package_stages for this package
  FOR v_stage IN
    SELECT ps.stage_id, ps.sort_order, ps.is_recurring
      FROM package_stages ps
     WHERE ps.package_id = p_package_id
     ORDER BY ps.sort_order
  LOOP
    -- Insert stage_instance
    INSERT INTO stage_instances (
      stage_id,
      packageinstance_id,
      stage_sortorder,
      status_id,
      status,
      is_recurring
    ) VALUES (
      v_stage.stage_id::integer,
      v_package_instance_id,
      v_stage.sort_order,
      0,
      'Not Started',
      v_stage.is_recurring
    )
    RETURNING id INTO v_stage_instance_id;

    -- 2a. Staff tasks
    INSERT INTO staff_task_instances (stafftask_id, stageinstance_id, status_id, status)
    SELECT st.id, v_stage_instance_id, 0, 'Not Started'
      FROM staff_tasks st
     WHERE st.stage_id = v_stage.stage_id::integer;

    -- 2b. Client tasks
    INSERT INTO client_task_instances (clienttask_id, stageinstance_id, status, due_date)
    SELECT ct.id,
           v_stage_instance_id,
           0,
           CASE WHEN ct.due_date_offset IS NOT NULL
                THEN (CURRENT_DATE + ct.due_date_offset * INTERVAL '1 day')
                ELSE NULL
           END
      FROM client_tasks ct
     WHERE ct.stage_id = v_stage.stage_id::integer;

    -- 2c. Emails (scoped by stage_id only — package_id filter removed)
    INSERT INTO email_instances (email_id, stageinstance_id, subject, content, is_sent, user_attachments)
    SELECT e.id, v_stage_instance_id, e.subject, e.content, false, ''
      FROM emails e
     WHERE e.stage_id = v_stage.stage_id::integer;

    -- 2d. Documents (from documents table directly, not stage_documents)
    INSERT INTO document_instances (document_id, stageinstance_id, tenant_id, status, isgenerated)
    SELECT d.id, v_stage_instance_id, p_tenant_id, 'pending', false
      FROM documents d
     WHERE d.stage = v_stage.stage_id::integer;

  END LOOP;

  -- 3. Audit log
  INSERT INTO client_audit_log (
    tenant_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    after_data
  ) VALUES (
    p_tenant_id,
    auth.uid(),
    'package_started',
    'package_instances',
    v_package_instance_id::text,
    jsonb_build_object(
      'package_id', p_package_id,
      'assigned_csc_user_id', p_assigned_csc_user_id
    )
  );

  RETURN v_package_instance_id;
END;
$function$;