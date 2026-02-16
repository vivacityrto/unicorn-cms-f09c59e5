
-- ============================================================
-- PHASE 2: Enforce package on posting + fix/create posting RPCs
-- ============================================================

-- 1. VALIDATION TRIGGER: Require package_id on new time_entries
-- when the tenant has 2+ active package instances.
-- This is a soft enforcement — single-package tenants can still omit it.
CREATE OR REPLACE FUNCTION public.fn_validate_time_entry_package()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_count int;
BEGIN
  -- Count active packages for this tenant
  SELECT count(*) INTO v_active_count
  FROM public.package_instances
  WHERE tenant_id = NEW.tenant_id
    AND is_complete = false;

  -- If tenant has multiple packages, package_id is required
  IF v_active_count > 1 AND NEW.package_id IS NULL THEN
    RAISE EXCEPTION 'package_id is required when tenant has multiple active packages (tenant_id: %, active: %)', 
      NEW.tenant_id, v_active_count;
  END IF;

  -- If tenant has exactly 1 package and package_id is null, auto-fill it
  IF v_active_count = 1 AND NEW.package_id IS NULL THEN
    SELECT id INTO NEW.package_id
    FROM public.package_instances
    WHERE tenant_id = NEW.tenant_id
      AND is_complete = false
    LIMIT 1;
  END IF;

  -- Validate that package_id belongs to this tenant if set
  IF NEW.package_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.package_instances
      WHERE id = NEW.package_id AND tenant_id = NEW.tenant_id
    ) THEN
      RAISE EXCEPTION 'package_id % does not belong to tenant %', NEW.package_id, NEW.tenant_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_time_entry_package ON public.time_entries;
CREATE TRIGGER trg_validate_time_entry_package
  BEFORE INSERT OR UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.fn_validate_time_entry_package();

-- 2. FIX rpc_bulk_post_time_drafts to use correct column names
-- and enforce package validation
CREATE OR REPLACE FUNCTION public.rpc_bulk_post_time_drafts(p_draft_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_draft record;
  v_posted_count int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_time_entry_id uuid;
  v_active_pkg_count int;
BEGIN
  FOR v_draft IN (
    SELECT d.*, t.name as client_name
    FROM public.calendar_time_drafts d
    LEFT JOIN public.tenants t ON t.id = d.client_id
    WHERE d.id = ANY(p_draft_ids)
      AND d.created_by = auth.uid()
      AND d.status = 'draft'
  )
  LOOP
    -- Validate required fields
    IF v_draft.client_id IS NULL THEN
      v_errors := v_errors || jsonb_build_object('draft_id', v_draft.id, 'error', 'Client is required');
      CONTINUE;
    END IF;
    
    IF v_draft.minutes IS NULL OR v_draft.minutes <= 0 THEN
      v_errors := v_errors || jsonb_build_object('draft_id', v_draft.id, 'error', 'Minutes must be greater than 0');
      CONTINUE;
    END IF;

    -- Check if package is required (multi-package tenant)
    SELECT count(*) INTO v_active_pkg_count
    FROM public.package_instances
    WHERE tenant_id = v_draft.tenant_id AND is_complete = false;

    IF v_active_pkg_count > 1 AND v_draft.package_id IS NULL THEN
      v_errors := v_errors || jsonb_build_object(
        'draft_id', v_draft.id, 
        'error', 'Package selection is required. This client has multiple active packages.'
      );
      CONTINUE;
    END IF;

    -- Insert into time_entries using correct column names
    INSERT INTO public.time_entries (
      tenant_id,
      client_id,
      user_id,
      package_id,
      stage_id,
      work_type,
      is_billable,
      start_at,
      duration_minutes,
      notes,
      source,
      calendar_event_id
    ) VALUES (
      v_draft.tenant_id,
      v_draft.client_id,
      v_draft.created_by,
      v_draft.package_id,
      v_draft.stage_id,
      COALESCE(v_draft.work_type, 'meeting'),
      COALESCE(v_draft.is_billable, true),
      v_draft.work_date::timestamptz,
      v_draft.minutes,
      v_draft.notes,
      COALESCE(v_draft.source, 'calendar'),
      v_draft.calendar_event_id
    )
    RETURNING id INTO v_time_entry_id;

    -- Update draft to posted
    UPDATE public.calendar_time_drafts
    SET status = 'posted',
        posted_time_entry_id = v_time_entry_id,
        updated_at = now()
    WHERE id = v_draft.id;

    v_posted_count := v_posted_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'posted_count', v_posted_count,
    'errors', v_errors
  );
END;
$$;

-- 3. CREATE standalone post_time_draft function for single drafts
-- with explicit package override
CREATE OR REPLACE FUNCTION public.post_time_draft(
  p_draft_id uuid,
  p_package_instance_id bigint,
  p_stage_instance_id bigint DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_draft record;
  v_time_entry_id uuid;
BEGIN
  -- Fetch draft
  SELECT * INTO v_draft
  FROM public.calendar_time_drafts
  WHERE id = p_draft_id
    AND created_by = auth.uid()
    AND status = 'draft';

  IF v_draft IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Draft not found or not yours');
  END IF;

  IF v_draft.client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Client is required');
  END IF;

  IF v_draft.minutes IS NULL OR v_draft.minutes <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Minutes must be greater than 0');
  END IF;

  -- Validate package belongs to tenant
  IF p_package_instance_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.package_instances
      WHERE id = p_package_instance_id 
        AND tenant_id = v_draft.tenant_id
        AND is_complete = false
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Invalid or inactive package for this tenant');
    END IF;
  END IF;

  -- Insert time entry
  INSERT INTO public.time_entries (
    tenant_id,
    client_id,
    user_id,
    package_id,
    stage_id,
    work_type,
    is_billable,
    start_at,
    duration_minutes,
    notes,
    source,
    calendar_event_id
  ) VALUES (
    v_draft.tenant_id,
    v_draft.client_id,
    v_draft.created_by,
    p_package_instance_id,
    p_stage_instance_id,
    COALESCE(v_draft.work_type, 'meeting'),
    COALESCE(v_draft.is_billable, true),
    v_draft.work_date::timestamptz,
    v_draft.minutes,
    COALESCE(p_note, v_draft.notes),
    COALESCE(v_draft.source, 'calendar'),
    v_draft.calendar_event_id
  )
  RETURNING id INTO v_time_entry_id;

  -- Mark draft as posted
  UPDATE public.calendar_time_drafts
  SET status = 'posted',
      posted_time_entry_id = v_time_entry_id,
      package_id = p_package_instance_id,
      updated_at = now()
  WHERE id = p_draft_id;

  RETURN jsonb_build_object(
    'success', true,
    'time_entry_id', v_time_entry_id
  );
END;
$$;

-- 4. CREATE move_time_entry_package function for reallocation
CREATE OR REPLACE FUNCTION public.move_time_entry_package(
  p_time_entry_id uuid,
  p_new_package_id bigint,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry record;
BEGIN
  -- Fetch entry
  SELECT * INTO v_entry
  FROM public.time_entries
  WHERE id = p_time_entry_id;

  IF v_entry IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Time entry not found');
  END IF;

  -- Check access: must be vivacity staff or own entry
  IF NOT public.is_vivacity_team_safe(auth.uid()) AND v_entry.user_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
  END IF;

  -- Validate new package belongs to same tenant
  IF NOT EXISTS (
    SELECT 1 FROM public.package_instances
    WHERE id = p_new_package_id 
      AND tenant_id = v_entry.tenant_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Package does not belong to this tenant');
  END IF;

  -- Update (trigger will write audit log automatically)
  UPDATE public.time_entries
  SET package_id = p_new_package_id, updated_at = now()
  WHERE id = p_time_entry_id;

  -- Write explicit audit with reason
  INSERT INTO public.time_entry_audit_log (time_entry_id, tenant_id, action, old_row, new_row, reason, actor_user_id)
  VALUES (
    p_time_entry_id,
    v_entry.tenant_id,
    'repost',
    jsonb_build_object('package_id', v_entry.package_id),
    jsonb_build_object('package_id', p_new_package_id),
    p_reason,
    auth.uid()
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 5. CREATE split_time_entry function
CREATE OR REPLACE FUNCTION public.split_time_entry(
  p_time_entry_id uuid,
  p_splits jsonb, -- array of { package_id: bigint, minutes: int }
  p_reason text DEFAULT 'Split across packages'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry record;
  v_split record;
  v_total_minutes int := 0;
  v_new_ids uuid[] := '{}';
  v_new_id uuid;
BEGIN
  -- Fetch original entry
  SELECT * INTO v_entry
  FROM public.time_entries
  WHERE id = p_time_entry_id;

  IF v_entry IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Time entry not found');
  END IF;

  -- Check access
  IF NOT public.is_vivacity_team_safe(auth.uid()) AND v_entry.user_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied');
  END IF;

  -- Validate splits sum to original minutes
  SELECT COALESCE(SUM((s->>'minutes')::int), 0) INTO v_total_minutes
  FROM jsonb_array_elements(p_splits) s;

  IF v_total_minutes != v_entry.duration_minutes THEN
    RETURN jsonb_build_object('success', false, 'error', 
      format('Split minutes (%s) must equal original (%s)', v_total_minutes, v_entry.duration_minutes));
  END IF;

  -- Delete original (audit trigger captures it)
  DELETE FROM public.time_entries WHERE id = p_time_entry_id;

  -- Insert splits
  FOR v_split IN SELECT * FROM jsonb_array_elements(p_splits)
  LOOP
    INSERT INTO public.time_entries (
      tenant_id, client_id, user_id, package_id, stage_id, task_id,
      work_type, is_billable, start_at, end_at, duration_minutes,
      notes, source, calendar_event_id
    ) VALUES (
      v_entry.tenant_id, v_entry.client_id, v_entry.user_id,
      (v_split.value->>'package_id')::integer,
      v_entry.stage_id, v_entry.task_id,
      v_entry.work_type, v_entry.is_billable, v_entry.start_at, v_entry.end_at,
      (v_split.value->>'minutes')::integer,
      v_entry.notes, v_entry.source, v_entry.calendar_event_id
    )
    RETURNING id INTO v_new_id;
    v_new_ids := v_new_ids || v_new_id;
  END LOOP;

  -- Write split audit record
  INSERT INTO public.time_entry_audit_log (time_entry_id, tenant_id, action, old_row, new_row, reason, actor_user_id)
  VALUES (
    p_time_entry_id,
    v_entry.tenant_id,
    'split',
    to_jsonb(v_entry),
    jsonb_build_object('new_entry_ids', to_jsonb(v_new_ids), 'splits', p_splits),
    p_reason,
    auth.uid()
  );

  RETURN jsonb_build_object('success', true, 'new_entry_ids', to_jsonb(v_new_ids));
END;
$$;
