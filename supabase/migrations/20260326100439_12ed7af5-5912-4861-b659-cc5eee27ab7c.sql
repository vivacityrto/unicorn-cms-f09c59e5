CREATE OR REPLACE FUNCTION public.publish_stage_version(p_stage_id integer, p_notes text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stage record;
  v_snapshot jsonb;
  v_team_tasks jsonb;
  v_client_tasks jsonb;
  v_emails jsonb;
  v_documents jsonb;
  v_next_version int;
  v_version_id uuid;
  v_si record;
BEGIN
  -- 1. Read stage from the correct table
  SELECT * INTO v_stage
  FROM public.stages
  WHERE id = p_stage_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stage not found';
  END IF;
  
  -- 2. Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_next_version
  FROM public.stage_versions
  WHERE stage_id = p_stage_id;
  
  -- 3. Build stage snapshot
  v_snapshot := jsonb_build_object(
    'stage', jsonb_build_object(
      'id', v_stage.id,
      'name', v_stage.name,
      'type', v_stage.stage_type,
      'description', v_stage.description,
      'ai_hint', v_stage.ai_hint,
      'is_certified', v_stage.is_certified,
      'certified_notes', v_stage.certified_notes
    )
  );
  
  -- 4. Snapshot team tasks from staff_tasks
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id, 'name', name, 'description', description,
      'sort_order', order_number, 'is_core', is_core,
      'is_key_event', is_key_event, 'due_date_offset', due_date_offset,
      'is_recurring', is_recurring
    ) ORDER BY order_number
  ), '[]'::jsonb)
  INTO v_team_tasks
  FROM public.staff_tasks WHERE stage_id = p_stage_id;
  
  v_snapshot := v_snapshot || jsonb_build_object('team_tasks', v_team_tasks);
  
  -- 5. Snapshot client tasks from client_tasks
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id, 'name', name, 'description', description,
      'instructions', instructions, 'sort_order', sort_order,
      'due_date_offset', due_date_offset, 'is_mandatory', is_mandatory
    ) ORDER BY sort_order
  ), '[]'::jsonb)
  INTO v_client_tasks
  FROM public.client_tasks WHERE stage_id = p_stage_id;
  
  v_snapshot := v_snapshot || jsonb_build_object('client_tasks', v_client_tasks);
  
  -- 6. Snapshot emails directly from emails table
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id, 'name', name, 'subject', subject,
      'description', description, 'sort_order', order_number,
      'is_core', is_core
    ) ORDER BY order_number
  ), '[]'::jsonb)
  INTO v_emails
  FROM public.emails WHERE stage_id = p_stage_id;
  
  v_snapshot := v_snapshot || jsonb_build_object('emails', v_emails);
  
  -- 7. Snapshot documents
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', sd.id, 'document_id', sd.document_id,
      'visibility', sd.visibility, 'delivery_type', sd.delivery_type,
      'sort_order', sd.sort_order, 'document_name', d.title,
      'is_core', sd.is_core, 'is_active', sd.is_active,
      'is_required', sd.is_required
    ) ORDER BY sd.sort_order
  ), '[]'::jsonb)
  INTO v_documents
  FROM public.stage_documents sd
  LEFT JOIN public.documents d ON d.id = sd.document_id
  WHERE sd.stage_id = p_stage_id;
  
  v_snapshot := v_snapshot || jsonb_build_object('documents', v_documents);
  
  -- 8. Insert version row
  INSERT INTO public.stage_versions (stage_id, version_number, status, notes, snapshot, created_by)
  VALUES (p_stage_id, v_next_version, 'published', p_notes, v_snapshot, auth.uid())
  RETURNING id INTO v_version_id;
  
  -- 9. Audit event — entity_id is uuid, pass v_version_id directly
  INSERT INTO public.audit_events (action, entity, entity_id, user_id, details)
  VALUES (
    'publish', 'stage_version', v_version_id, auth.uid(),
    jsonb_build_object('stage_id', p_stage_id, 'version', v_next_version, 'notes', p_notes)
  );
  
  -- 10. Sync active instances (additive only)
  FOR v_si IN
    SELECT si.id AS stage_instance_id
    FROM public.stage_instances si
    JOIN public.package_instances pi ON pi.id = si.packageinstance_id
    WHERE si.stage_id = p_stage_id
      AND pi.is_complete = false
  LOOP
    -- Insert missing staff_task_instances
    INSERT INTO public.staff_task_instances (stafftask_id, stageinstance_id, status_id, status, is_core)
    SELECT st.id, v_si.stage_instance_id, 0, 'Not Started', st.is_core
    FROM public.staff_tasks st
    WHERE st.stage_id = p_stage_id
      AND NOT EXISTS (
        SELECT 1 FROM public.staff_task_instances sti
        WHERE sti.stageinstance_id = v_si.stage_instance_id
          AND sti.stafftask_id = st.id
      );
    
    -- Insert missing client_task_instances (status is integer)
    INSERT INTO public.client_task_instances (clienttask_id, stageinstance_id, status)
    SELECT ct.id, v_si.stage_instance_id, 0
    FROM public.client_tasks ct
    WHERE ct.stage_id = p_stage_id
      AND NOT EXISTS (
        SELECT 1 FROM public.client_task_instances cti
        WHERE cti.stageinstance_id = v_si.stage_instance_id
          AND cti.clienttask_id = ct.id
      );
    
    -- Insert missing email_instances
    INSERT INTO public.email_instances (email_id, stageinstance_id, is_sent, is_core)
    SELECT e.id, v_si.stage_instance_id, false, e.is_core
    FROM public.emails e
    WHERE e.stage_id = p_stage_id
      AND NOT EXISTS (
        SELECT 1 FROM public.email_instances ei
        WHERE ei.stageinstance_id = v_si.stage_instance_id
          AND ei.email_id = e.id
      );
  END LOOP;
  
  RETURN v_version_id;
END;
$$;