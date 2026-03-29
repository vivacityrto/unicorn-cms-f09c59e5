-- Add document_title column for resilience against deleted source documents
ALTER TABLE public.document_instances ADD COLUMN document_title text NULL;

-- Backfill from existing documents table
UPDATE public.document_instances di
SET document_title = d.title
FROM public.documents d
WHERE di.document_id = d.id;

-- Update publish_stage_version to populate document_title on insert
CREATE OR REPLACE FUNCTION public.publish_stage_version(p_stage_id bigint, p_notes text DEFAULT NULL)
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
  -- 1. Read stage
  SELECT * INTO v_stage FROM public.stages WHERE id = p_stage_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stage not found'; END IF;

  -- 2. Next version number
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version
  FROM public.stage_versions WHERE stage_id = p_stage_id;

  -- 3. Stage snapshot
  v_snapshot := jsonb_build_object(
    'stage', jsonb_build_object(
      'id', v_stage.id, 'name', v_stage.name, 'type', v_stage.stage_type,
      'description', v_stage.description, 'ai_hint', v_stage.ai_hint,
      'is_certified', v_stage.is_certified, 'certified_notes', v_stage.certified_notes
    )
  );

  -- 4. Team tasks
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id, 'name', name, 'description', description,
      'sort_order', order_number, 'is_core', is_core,
      'is_key_event', is_key_event, 'due_date_offset', due_date_offset,
      'is_recurring', is_recurring
    ) ORDER BY order_number
  ), '[]'::jsonb) INTO v_team_tasks
  FROM public.staff_tasks WHERE stage_id = p_stage_id;
  v_snapshot := v_snapshot || jsonb_build_object('team_tasks', v_team_tasks);

  -- 5. Client tasks
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id, 'name', name, 'description', description,
      'instructions', instructions, 'sort_order', sort_order,
      'due_date_offset', due_date_offset, 'is_mandatory', is_mandatory
    ) ORDER BY sort_order
  ), '[]'::jsonb) INTO v_client_tasks
  FROM public.client_tasks WHERE stage_id = p_stage_id;
  v_snapshot := v_snapshot || jsonb_build_object('client_tasks', v_client_tasks);

  -- 6. Emails
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id, 'name', name, 'subject', subject,
      'description', description, 'sort_order', order_number,
      'is_core', is_core
    ) ORDER BY order_number
  ), '[]'::jsonb) INTO v_emails
  FROM public.emails WHERE stage_id = p_stage_id;
  v_snapshot := v_snapshot || jsonb_build_object('emails', v_emails);

  -- 7. Documents — from documents.stage
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', d.id, 'document_id', d.id,
      'visibility', 'both', 'delivery_type', 'manual',
      'sort_order', 0, 'document_name', d.title,
      'is_core', false, 'is_active', true,
      'is_required', false
    ) ORDER BY d.title
  ), '[]'::jsonb) INTO v_documents
  FROM public.documents d
  WHERE d.stage = p_stage_id;
  v_snapshot := v_snapshot || jsonb_build_object('documents', v_documents);

  -- 8. Insert version
  INSERT INTO public.stage_versions (stage_id, version_number, status, notes, snapshot, created_by)
  VALUES (p_stage_id, v_next_version, 'published', p_notes, v_snapshot, auth.uid())
  RETURNING id INTO v_version_id;

  -- 9. Audit
  INSERT INTO public.audit_events (action, entity, entity_id, user_id, details)
  VALUES ('publish', 'stage_version', v_version_id, auth.uid(),
    jsonb_build_object('stage_id', p_stage_id, 'version', v_next_version, 'notes', p_notes));

  -- 10. Sync active instances (additive only) — now includes document_title
  FOR v_si IN
    SELECT si.id AS stage_instance_id
    FROM public.stage_instances si
    JOIN public.package_instances pi ON pi.id = si.packageinstance_id
    WHERE si.stage_id = p_stage_id AND pi.is_complete = false
  LOOP
    INSERT INTO public.staff_task_instances (stafftask_id, stageinstance_id, status_id, status, is_core)
    SELECT st.id, v_si.stage_instance_id, 0, 'Not Started', st.is_core
    FROM public.staff_tasks st
    WHERE st.stage_id = p_stage_id
      AND NOT EXISTS (
        SELECT 1 FROM public.staff_task_instances sti
        WHERE sti.stageinstance_id = v_si.stage_instance_id AND sti.stafftask_id = st.id
      );

    INSERT INTO public.client_task_instances (clienttask_id, stageinstance_id, status_id, status)
    SELECT ct.id, v_si.stage_instance_id, 0, 'Not Started'
    FROM public.client_tasks ct
    WHERE ct.stage_id = p_stage_id
      AND NOT EXISTS (
        SELECT 1 FROM public.client_task_instances cti
        WHERE cti.stageinstance_id = v_si.stage_instance_id AND cti.clienttask_id = ct.id
      );

    INSERT INTO public.document_instances (document_id, stageinstance_id, tenant_id, status, document_title)
    SELECT d.id, v_si.stage_instance_id,
      (SELECT pi2.tenant_id FROM public.package_instances pi2
       JOIN public.stage_instances si2 ON si2.packageinstance_id = pi2.id
       WHERE si2.id = v_si.stage_instance_id LIMIT 1),
      'pending',
      d.title
    FROM public.documents d
    WHERE d.stage = p_stage_id
      AND NOT EXISTS (
        SELECT 1 FROM public.document_instances di
        WHERE di.stageinstance_id = v_si.stage_instance_id AND di.document_id = d.id
      );
  END LOOP;

  RETURN v_version_id;
END;
$$;