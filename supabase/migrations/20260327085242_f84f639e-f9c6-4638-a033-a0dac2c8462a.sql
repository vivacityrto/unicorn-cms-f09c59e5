-- 1. Truncate stage_documents (legacy data, FK points to deprecated documents_stages)
TRUNCATE TABLE public.stage_documents;

-- 2. Replace publish_stage_version: change document snapshot to use documents.stage
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

  -- 7. Documents — NOW from documents.stage instead of stage_documents
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

  -- 10. Sync active instances (additive only)
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

    INSERT INTO public.document_instances (document_id, stageinstance_id, tenant_id, status)
    SELECT d.id, v_si.stage_instance_id,
      (SELECT pi2.tenant_id FROM public.package_instances pi2
       JOIN public.stage_instances si2 ON si2.packageinstance_id = pi2.id
       WHERE si2.id = v_si.stage_instance_id LIMIT 1),
      'pending'
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

-- 3. Replace copy_stage_template_to_package: change document source
CREATE OR REPLACE FUNCTION public.copy_stage_template_to_package(p_package_id bigint, p_stage_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Copy team tasks with source tracking
  INSERT INTO public.package_staff_tasks (
    package_id, stage_id, name, description, order_number,
    owner_role, estimated_hours, is_mandatory,
    source_stage_task_id, is_override, is_deleted
  )
  SELECT
    p_package_id, p_stage_id, name, description, sort_order,
    owner_role, estimated_hours, is_mandatory,
    id, false, false
  FROM public.stage_team_tasks
  WHERE stage_id = p_stage_id;

  -- Copy client tasks with source tracking
  INSERT INTO public.package_client_tasks (
    package_id, stage_id, name, description, order_number,
    instructions, required_documents, due_date_offset,
    source_stage_task_id, is_override, is_deleted
  )
  SELECT
    p_package_id, p_stage_id, name, description, sort_order,
    instructions, required_documents, due_date_offset,
    id, false, false
  FROM public.stage_client_tasks
  WHERE stage_id = p_stage_id;

  -- Copy emails with source tracking
  INSERT INTO public.package_stage_emails (
    package_id, stage_id, email_template_id, trigger_type,
    recipient_type, sort_order, is_active,
    source_stage_email_id, is_override, is_deleted
  )
  SELECT
    p_package_id, p_stage_id, email_template_id, trigger_type,
    recipient_type, sort_order, is_active,
    id, false, false
  FROM public.stage_emails
  WHERE stage_id = p_stage_id;

  -- Copy documents — NOW from documents.stage
  INSERT INTO public.package_stage_documents (
    package_id, stage_id, document_id, visibility, delivery_type, sort_order,
    source_stage_document_id, is_override, is_deleted
  )
  SELECT
    p_package_id, p_stage_id, d.id, 'both', 'manual', 0,
    d.id, false, false
  FROM public.documents d
  WHERE d.stage = p_stage_id;

  -- Update package_stages
  UPDATE public.package_stages
  SET use_overrides = true, last_synced_at = now()
  WHERE package_id = p_package_id AND stage_id = p_stage_id;
END;
$$;

-- 4. Replace document_stage_usage view — use documents.stage joined to stages
DROP VIEW IF EXISTS public.document_stage_usage;
CREATE VIEW public.document_stage_usage AS
SELECT
  d.id AS document_id,
  d.title,
  count(DISTINCT d.stage) AS stage_count,
  array_agg(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL) AS stage_names
FROM public.documents d
LEFT JOIN public.stages s ON s.id = d.stage
GROUP BY d.id, d.title;

-- 5. Replace get_document_stage_usage function — use documents.stage
CREATE OR REPLACE FUNCTION public.get_document_stage_usage(p_document_id bigint)
RETURNS TABLE(
  stage_id bigint,
  stage_name text,
  package_count bigint,
  pinned_version_id uuid,
  pinned_version_number integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.stage::bigint,
    s.name::text,
    (SELECT COUNT(DISTINCT ps.package_id) FROM public.package_stages ps WHERE ps.stage_id = d.stage)::bigint,
    NULL::uuid,
    NULL::integer
  FROM public.documents d
  JOIN public.stages s ON s.id = d.stage
  WHERE d.id = p_document_id
    AND d.stage IS NOT NULL;
END;
$$;