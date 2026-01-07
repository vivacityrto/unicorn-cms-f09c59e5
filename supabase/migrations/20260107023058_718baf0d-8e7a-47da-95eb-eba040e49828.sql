-- Phase 3: Add override tracking columns to package tables

-- 1) Add source tracking to package_staff_tasks
ALTER TABLE public.package_staff_tasks
ADD COLUMN IF NOT EXISTS source_stage_task_id bigint NULL,
ADD COLUMN IF NOT EXISTS is_override boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_package_staff_tasks_source 
ON public.package_staff_tasks(source_stage_task_id);

CREATE INDEX IF NOT EXISTS idx_package_staff_tasks_package_stage 
ON public.package_staff_tasks(package_id, stage_id);

-- 2) Add source tracking to package_client_tasks
ALTER TABLE public.package_client_tasks
ADD COLUMN IF NOT EXISTS source_stage_task_id bigint NULL,
ADD COLUMN IF NOT EXISTS is_override boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_package_client_tasks_source 
ON public.package_client_tasks(source_stage_task_id);

CREATE INDEX IF NOT EXISTS idx_package_client_tasks_package_stage 
ON public.package_client_tasks(package_id, stage_id);

-- 3) Add source tracking to package_stage_emails
ALTER TABLE public.package_stage_emails
ADD COLUMN IF NOT EXISTS source_stage_email_id bigint NULL,
ADD COLUMN IF NOT EXISTS is_override boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_package_stage_emails_source 
ON public.package_stage_emails(source_stage_email_id);

CREATE INDEX IF NOT EXISTS idx_package_stage_emails_package_stage 
ON public.package_stage_emails(package_id, stage_id);

-- 4) Add source tracking to package_stage_documents
ALTER TABLE public.package_stage_documents
ADD COLUMN IF NOT EXISTS source_stage_document_id bigint NULL,
ADD COLUMN IF NOT EXISTS is_override boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_package_stage_documents_source 
ON public.package_stage_documents(source_stage_document_id);

CREATE INDEX IF NOT EXISTS idx_package_stage_documents_package_stage 
ON public.package_stage_documents(package_id, stage_id);

-- 5) Add last_synced_at to package_stages for tracking
ALTER TABLE public.package_stages
ADD COLUMN IF NOT EXISTS last_synced_at timestamptz NULL;

-- 6) Create function to copy stage template to package with source tracking
CREATE OR REPLACE FUNCTION public.copy_stage_template_to_package(
  p_package_id bigint,
  p_stage_id bigint
) RETURNS void AS $$
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

  -- Copy documents with source tracking
  INSERT INTO public.package_stage_documents (
    package_id, stage_id, document_id, visibility, delivery_type, sort_order,
    source_stage_document_id, is_override, is_deleted
  )
  SELECT 
    p_package_id, p_stage_id, document_id, visibility, delivery_type, sort_order,
    id, false, false
  FROM public.stage_documents
  WHERE stage_id = p_stage_id;

  -- Update package_stages with override flag and sync time
  UPDATE public.package_stages
  SET use_overrides = true, last_synced_at = now()
  WHERE package_id = p_package_id AND stage_id = p_stage_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 7) Create function to sync stage template updates to packages (non-overridden items only)
CREATE OR REPLACE FUNCTION public.sync_stage_template_to_packages(
  p_stage_id bigint
) RETURNS jsonb AS $$
DECLARE
  v_package record;
  v_updated_count int := 0;
  v_skipped_count int := 0;
  v_result jsonb := '{"updated": [], "skipped": []}';
BEGIN
  FOR v_package IN 
    SELECT ps.package_id, p.name as package_name
    FROM public.package_stages ps
    JOIN public.packages p ON p.id = ps.package_id
    WHERE ps.stage_id = p_stage_id AND ps.use_overrides = true
  LOOP
    -- Update non-overridden team tasks
    UPDATE public.package_staff_tasks pt
    SET 
      name = st.name,
      description = st.description,
      order_number = st.sort_order,
      owner_role = st.owner_role,
      estimated_hours = st.estimated_hours,
      is_mandatory = st.is_mandatory,
      updated_at = now()
    FROM public.stage_team_tasks st
    WHERE pt.source_stage_task_id = st.id
      AND pt.package_id = v_package.package_id
      AND pt.stage_id = p_stage_id
      AND pt.is_override = false
      AND pt.is_deleted = false;

    -- Update non-overridden client tasks
    UPDATE public.package_client_tasks pt
    SET 
      name = st.name,
      description = st.description,
      order_number = st.sort_order,
      instructions = st.instructions,
      required_documents = st.required_documents,
      due_date_offset = st.due_date_offset,
      updated_at = now()
    FROM public.stage_client_tasks st
    WHERE pt.source_stage_task_id = st.id
      AND pt.package_id = v_package.package_id
      AND pt.stage_id = p_stage_id
      AND pt.is_override = false
      AND pt.is_deleted = false;

    -- Update non-overridden emails
    UPDATE public.package_stage_emails pe
    SET 
      email_template_id = se.email_template_id,
      trigger_type = se.trigger_type,
      recipient_type = se.recipient_type,
      sort_order = se.sort_order,
      is_active = se.is_active
    FROM public.stage_emails se
    WHERE pe.source_stage_email_id = se.id
      AND pe.package_id = v_package.package_id
      AND pe.stage_id = p_stage_id
      AND pe.is_override = false
      AND pe.is_deleted = false;

    -- Update non-overridden documents
    UPDATE public.package_stage_documents pd
    SET 
      document_id = sd.document_id,
      visibility = sd.visibility,
      delivery_type = sd.delivery_type,
      sort_order = sd.sort_order
    FROM public.stage_documents sd
    WHERE pd.source_stage_document_id = sd.id
      AND pd.package_id = v_package.package_id
      AND pd.stage_id = p_stage_id
      AND pd.is_override = false
      AND pd.is_deleted = false;

    -- Insert new template items that don't exist yet
    INSERT INTO public.package_staff_tasks (
      package_id, stage_id, name, description, order_number,
      owner_role, estimated_hours, is_mandatory,
      source_stage_task_id, is_override, is_deleted
    )
    SELECT 
      v_package.package_id, p_stage_id, st.name, st.description, st.sort_order,
      st.owner_role, st.estimated_hours, st.is_mandatory,
      st.id, false, false
    FROM public.stage_team_tasks st
    WHERE st.stage_id = p_stage_id
      AND NOT EXISTS (
        SELECT 1 FROM public.package_staff_tasks pt
        WHERE pt.package_id = v_package.package_id
          AND pt.stage_id = p_stage_id
          AND pt.source_stage_task_id = st.id
      );

    INSERT INTO public.package_client_tasks (
      package_id, stage_id, name, description, order_number,
      instructions, required_documents, due_date_offset,
      source_stage_task_id, is_override, is_deleted
    )
    SELECT 
      v_package.package_id, p_stage_id, st.name, st.description, st.sort_order,
      st.instructions, st.required_documents, st.due_date_offset,
      st.id, false, false
    FROM public.stage_client_tasks st
    WHERE st.stage_id = p_stage_id
      AND NOT EXISTS (
        SELECT 1 FROM public.package_client_tasks pt
        WHERE pt.package_id = v_package.package_id
          AND pt.stage_id = p_stage_id
          AND pt.source_stage_task_id = st.id
      );

    INSERT INTO public.package_stage_emails (
      package_id, stage_id, email_template_id, trigger_type,
      recipient_type, sort_order, is_active,
      source_stage_email_id, is_override, is_deleted
    )
    SELECT 
      v_package.package_id, p_stage_id, se.email_template_id, se.trigger_type,
      se.recipient_type, se.sort_order, se.is_active,
      se.id, false, false
    FROM public.stage_emails se
    WHERE se.stage_id = p_stage_id
      AND NOT EXISTS (
        SELECT 1 FROM public.package_stage_emails pe
        WHERE pe.package_id = v_package.package_id
          AND pe.stage_id = p_stage_id
          AND pe.source_stage_email_id = se.id
      );

    INSERT INTO public.package_stage_documents (
      package_id, stage_id, document_id, visibility, delivery_type, sort_order,
      source_stage_document_id, is_override, is_deleted
    )
    SELECT 
      v_package.package_id, p_stage_id, sd.document_id, sd.visibility, sd.delivery_type, sd.sort_order,
      sd.id, false, false
    FROM public.stage_documents sd
    WHERE sd.stage_id = p_stage_id
      AND NOT EXISTS (
        SELECT 1 FROM public.package_stage_documents pd
        WHERE pd.package_id = v_package.package_id
          AND pd.stage_id = p_stage_id
          AND pd.source_stage_document_id = sd.id
      );

    -- Update sync timestamp
    UPDATE public.package_stages
    SET last_synced_at = now()
    WHERE package_id = v_package.package_id AND stage_id = p_stage_id;

    v_updated_count := v_updated_count + 1;
    v_result := jsonb_set(v_result, '{updated}', (v_result->'updated') || to_jsonb(v_package.package_name));
  END LOOP;

  v_result := jsonb_set(v_result, '{updated_count}', to_jsonb(v_updated_count));
  v_result := jsonb_set(v_result, '{skipped_count}', to_jsonb(v_skipped_count));
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 8) Grant execute permissions
GRANT EXECUTE ON FUNCTION public.copy_stage_template_to_package(bigint, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_stage_template_to_packages(bigint) TO authenticated;