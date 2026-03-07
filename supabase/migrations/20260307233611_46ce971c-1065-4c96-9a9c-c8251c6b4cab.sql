-- Fix rpc_post_time_draft to resolve package_instance_id and handle tenant_id
CREATE OR REPLACE FUNCTION public.rpc_post_time_draft(p_draft_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_draft public.calendar_time_drafts;
  v_user_id uuid;
  v_time_entry_id uuid;
  v_resolved_package_id bigint;
  v_resolved_tenant_id bigint;
BEGIN
  v_user_id := auth.uid();
  
  -- Get the draft
  SELECT * INTO v_draft 
  FROM public.calendar_time_drafts 
  WHERE id = p_draft_id AND created_by = v_user_id AND status = 'draft';
  
  IF v_draft IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'draft_not_found');
  END IF;
  
  -- Validate required fields
  IF v_draft.client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'client_required');
  END IF;
  
  IF v_draft.minutes <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_minutes');
  END IF;
  
  -- Use client_id as tenant_id (they are the same in this system)
  v_resolved_tenant_id := v_draft.client_id;
  
  -- Resolve package_id: check if it's already a valid package_instance_id,
  -- otherwise treat as base package_id and find the active instance
  v_resolved_package_id := v_draft.package_id;
  
  IF v_resolved_package_id IS NOT NULL THEN
    -- Check if it's already a valid package_instances.id
    IF NOT EXISTS (SELECT 1 FROM public.package_instances WHERE id = v_resolved_package_id) THEN
      -- Treat as base package_id, find the latest active instance for this client
      SELECT pi.id INTO v_resolved_package_id
      FROM public.package_instances pi
      WHERE pi.tenant_id = v_resolved_tenant_id
        AND pi.package_id = v_draft.package_id
        AND pi.is_complete = false
      ORDER BY pi.start_date DESC
      LIMIT 1;
    END IF;
  ELSE
    -- No package specified: try to find the single active instance for this client
    SELECT pi.id INTO v_resolved_package_id
    FROM public.package_instances pi
    WHERE pi.tenant_id = v_resolved_tenant_id
      AND pi.is_complete = false
    ORDER BY pi.start_date DESC
    LIMIT 1;
  END IF;
  
  -- Insert time entry
  INSERT INTO public.time_entries (
    tenant_id, client_id, package_id, stage_id, user_id, work_type, is_billable,
    start_at, duration_minutes, notes, source, calendar_event_id
  ) VALUES (
    v_resolved_tenant_id, v_draft.client_id, v_resolved_package_id, v_draft.stage_id,
    v_user_id, 'meeting', true,
    v_draft.work_date::timestamptz, v_draft.minutes, v_draft.notes, 'calendar', v_draft.calendar_event_id
  )
  RETURNING id INTO v_time_entry_id;
  
  -- Update draft status
  UPDATE public.calendar_time_drafts 
  SET status = 'posted', posted_time_entry_id = v_time_entry_id, updated_at = now()
  WHERE id = p_draft_id;
  
  RETURN jsonb_build_object('success', true, 'time_entry_id', v_time_entry_id);
END;
$$;