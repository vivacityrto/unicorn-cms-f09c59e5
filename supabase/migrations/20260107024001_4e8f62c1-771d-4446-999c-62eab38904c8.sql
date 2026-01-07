-- Phase 4: Stage Versioning and Release Controls

-- 1) Stage version table for snapshots
CREATE TABLE public.stage_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id bigint NOT NULL REFERENCES public.documents_stages(id) ON DELETE CASCADE,
  version_number int NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  notes text NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES auth.users(id),
  UNIQUE (stage_id, version_number)
);

CREATE INDEX idx_stage_versions_stage_id ON public.stage_versions(stage_id);
CREATE INDEX idx_stage_versions_status ON public.stage_versions(status);

-- 2) Add version tracking to package_stages
ALTER TABLE public.package_stages
  ADD COLUMN IF NOT EXISTS stage_version_id uuid NULL REFERENCES public.stage_versions(id),
  ADD COLUMN IF NOT EXISTS update_policy text NOT NULL DEFAULT 'manual' CHECK (update_policy IN ('manual', 'auto_non_certified')),
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz NULL;

-- 3) RLS for stage_versions
ALTER TABLE public.stage_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view stage versions"
  ON public.stage_versions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert stage versions"
  ON public.stage_versions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update stage versions"
  ON public.stage_versions FOR UPDATE
  TO authenticated
  USING (true);

-- 4) Function to check if stage is used by active client packages
CREATE OR REPLACE FUNCTION public.is_stage_in_active_use(p_stage_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM public.client_package_stages cps
  JOIN public.client_packages cp ON cp.id = cps.client_package_id
  WHERE cps.stage_id = p_stage_id
    AND cp.status IN ('active', 'in_progress');
  
  RETURN v_count > 0;
END;
$$;

-- 5) Function to publish a stage version
CREATE OR REPLACE FUNCTION public.publish_stage_version(
  p_stage_id bigint,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
BEGIN
  -- Get stage data
  SELECT * INTO v_stage
  FROM public.documents_stages
  WHERE id = p_stage_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stage not found';
  END IF;
  
  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_next_version
  FROM public.stage_versions
  WHERE stage_id = p_stage_id;
  
  -- Build snapshot: stage fields
  v_snapshot := jsonb_build_object(
    'stage', jsonb_build_object(
      'id', v_stage.id,
      'name', v_stage.name,
      'type', v_stage.type,
      'description', v_stage.description,
      'ai_hint', v_stage.ai_hint,
      'is_certified', v_stage.is_certified,
      'certified_notes', v_stage.certified_notes,
      'package_type', v_stage.package_type
    )
  );
  
  -- Get team tasks
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'name', name,
      'description', description,
      'owner_role', owner_role,
      'estimated_hours', estimated_hours,
      'is_mandatory', is_mandatory,
      'sort_order', sort_order
    ) ORDER BY sort_order
  ), '[]'::jsonb)
  INTO v_team_tasks
  FROM public.stage_team_tasks
  WHERE stage_id = p_stage_id;
  
  v_snapshot := v_snapshot || jsonb_build_object('team_tasks', v_team_tasks);
  
  -- Get client tasks
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'name', name,
      'instructions', instructions,
      'required_documents', required_documents,
      'sort_order', sort_order
    ) ORDER BY sort_order
  ), '[]'::jsonb)
  INTO v_client_tasks
  FROM public.stage_client_tasks
  WHERE stage_id = p_stage_id;
  
  v_snapshot := v_snapshot || jsonb_build_object('client_tasks', v_client_tasks);
  
  -- Get emails
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', se.id,
      'email_template_id', se.email_template_id,
      'trigger_type', se.trigger_type,
      'recipient_type', se.recipient_type,
      'is_active', se.is_active,
      'sort_order', se.sort_order,
      'template_name', et.name
    ) ORDER BY se.sort_order
  ), '[]'::jsonb)
  INTO v_emails
  FROM public.stage_emails se
  LEFT JOIN public.email_templates et ON et.id = se.email_template_id
  WHERE se.stage_id = p_stage_id;
  
  v_snapshot := v_snapshot || jsonb_build_object('emails', v_emails);
  
  -- Get documents
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', sd.id,
      'document_id', sd.document_id,
      'visibility', sd.visibility,
      'delivery_type', sd.delivery_type,
      'sort_order', sd.sort_order,
      'document_name', d.name
    ) ORDER BY sd.sort_order
  ), '[]'::jsonb)
  INTO v_documents
  FROM public.stage_documents sd
  LEFT JOIN public.documents d ON d.id = sd.document_id
  WHERE sd.stage_id = p_stage_id;
  
  v_snapshot := v_snapshot || jsonb_build_object('documents', v_documents);
  
  -- Create version record
  INSERT INTO public.stage_versions (stage_id, version_number, status, notes, snapshot, created_by)
  VALUES (p_stage_id, v_next_version, 'published', p_notes, v_snapshot, auth.uid())
  RETURNING id INTO v_version_id;
  
  -- Log the publish action
  INSERT INTO public.audit_events (action, entity, entity_id, user_id, details)
  VALUES (
    'publish',
    'stage_version',
    v_version_id::text,
    auth.uid(),
    jsonb_build_object('stage_id', p_stage_id, 'version', v_next_version, 'notes', p_notes)
  );
  
  RETURN v_version_id;
END;
$$;

-- 6) Function to get diff between two versions
CREATE OR REPLACE FUNCTION public.get_stage_version_diff(
  p_version_from uuid,
  p_version_to uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_from_snapshot jsonb;
  v_to_snapshot jsonb;
  v_diff jsonb;
BEGIN
  SELECT snapshot INTO v_from_snapshot
  FROM public.stage_versions WHERE id = p_version_from;
  
  SELECT snapshot INTO v_to_snapshot
  FROM public.stage_versions WHERE id = p_version_to;
  
  IF v_from_snapshot IS NULL OR v_to_snapshot IS NULL THEN
    RAISE EXCEPTION 'One or both versions not found';
  END IF;
  
  -- Build diff structure
  v_diff := jsonb_build_object(
    'from_version', p_version_from,
    'to_version', p_version_to,
    'stage', jsonb_build_object(
      'from', v_from_snapshot->'stage',
      'to', v_to_snapshot->'stage'
    ),
    'team_tasks', jsonb_build_object(
      'from', v_from_snapshot->'team_tasks',
      'to', v_to_snapshot->'team_tasks'
    ),
    'client_tasks', jsonb_build_object(
      'from', v_from_snapshot->'client_tasks',
      'to', v_to_snapshot->'client_tasks'
    ),
    'emails', jsonb_build_object(
      'from', v_from_snapshot->'emails',
      'to', v_to_snapshot->'emails'
    ),
    'documents', jsonb_build_object(
      'from', v_from_snapshot->'documents',
      'to', v_to_snapshot->'documents'
    )
  );
  
  RETURN v_diff;
END;
$$;

-- 7) Function to apply a stage version to a package
CREATE OR REPLACE FUNCTION public.apply_stage_version_to_package(
  p_package_id bigint,
  p_stage_id bigint,
  p_target_version_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_snapshot jsonb;
  v_stats jsonb;
  v_updated_tasks int := 0;
  v_updated_client_tasks int := 0;
  v_updated_emails int := 0;
  v_skipped_overrides int := 0;
  v_task record;
BEGIN
  -- Get the version snapshot
  SELECT snapshot INTO v_snapshot
  FROM public.stage_versions
  WHERE id = p_target_version_id;
  
  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'Version not found';
  END IF;
  
  -- Update package_stages to point to new version
  UPDATE public.package_stages
  SET stage_version_id = p_target_version_id,
      last_checked_at = now()
  WHERE package_id = p_package_id AND stage_id = p_stage_id;
  
  -- Sync inherited team tasks (Phase 3 logic: only non-overridden)
  FOR v_task IN SELECT * FROM jsonb_array_elements(v_snapshot->'team_tasks')
  LOOP
    -- Update inherited rows only
    UPDATE public.package_staff_tasks
    SET name = v_task.value->>'name',
        instructions = v_task.value->>'description',
        owner_role = v_task.value->>'owner_role',
        estimated_hours = (v_task.value->>'estimated_hours')::numeric,
        is_mandatory = (v_task.value->>'is_mandatory')::boolean,
        sort_order = (v_task.value->>'sort_order')::int
    WHERE package_id = p_package_id
      AND stage_id = p_stage_id
      AND source_stage_task_id = (v_task.value->>'id')::bigint
      AND is_override = false
      AND (is_deleted IS NULL OR is_deleted = false);
    
    IF FOUND THEN
      v_updated_tasks := v_updated_tasks + 1;
    END IF;
  END LOOP;
  
  -- Count skipped overrides
  SELECT COUNT(*) INTO v_skipped_overrides
  FROM public.package_staff_tasks
  WHERE package_id = p_package_id
    AND stage_id = p_stage_id
    AND is_override = true;
  
  -- Sync inherited client tasks
  FOR v_task IN SELECT * FROM jsonb_array_elements(v_snapshot->'client_tasks')
  LOOP
    UPDATE public.package_client_tasks
    SET name = v_task.value->>'name',
        instructions = v_task.value->>'instructions',
        sort_order = (v_task.value->>'sort_order')::int
    WHERE package_id = p_package_id
      AND stage_id = p_stage_id
      AND source_stage_task_id = (v_task.value->>'id')::bigint
      AND is_override = false
      AND (is_deleted IS NULL OR is_deleted = false);
    
    IF FOUND THEN
      v_updated_client_tasks := v_updated_client_tasks + 1;
    END IF;
  END LOOP;
  
  -- Log the upgrade action
  INSERT INTO public.audit_events (action, entity, entity_id, user_id, details)
  VALUES (
    'upgrade_package_stage_version',
    'package_stages',
    p_package_id::text || '_' || p_stage_id::text,
    auth.uid(),
    jsonb_build_object(
      'package_id', p_package_id,
      'stage_id', p_stage_id,
      'target_version_id', p_target_version_id
    )
  );
  
  v_stats := jsonb_build_object(
    'updated_team_tasks', v_updated_tasks,
    'updated_client_tasks', v_updated_client_tasks,
    'updated_emails', v_updated_emails,
    'skipped_overrides', v_skipped_overrides
  );
  
  RETURN v_stats;
END;
$$;

-- 8) Function to check if certified stage can be edited
CREATE OR REPLACE FUNCTION public.can_edit_certified_stage(p_stage_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_certified boolean;
  v_in_active_use boolean;
  v_active_package_count int;
BEGIN
  SELECT is_certified INTO v_is_certified
  FROM public.documents_stages
  WHERE id = p_stage_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('can_edit', false, 'reason', 'Stage not found');
  END IF;
  
  IF NOT v_is_certified THEN
    RETURN jsonb_build_object('can_edit', true, 'reason', 'Stage is not certified');
  END IF;
  
  -- Check active use
  SELECT COUNT(*)
  INTO v_active_package_count
  FROM public.client_package_stages cps
  JOIN public.client_packages cp ON cp.id = cps.client_package_id
  WHERE cps.stage_id = p_stage_id
    AND cp.status IN ('active', 'in_progress');
  
  v_in_active_use := v_active_package_count > 0;
  
  IF v_in_active_use THEN
    RETURN jsonb_build_object(
      'can_edit', false,
      'reason', 'Certified stage is in active use by ' || v_active_package_count || ' client package(s)',
      'active_count', v_active_package_count,
      'suggestion', 'Create a new version instead'
    );
  END IF;
  
  RETURN jsonb_build_object('can_edit', true, 'reason', 'Certified stage has no active client usage');
END;
$$;