-- Update the meeting time import function to allow SuperAdmin/staff access
-- Previously it only checked connected_tenants, which excludes SuperAdmins

CREATE OR REPLACE FUNCTION public.rpc_import_meeting_time_to_client(
  p_client_id bigint,
  p_calendar_event_id uuid,
  p_minutes integer,
  p_work_date date,
  p_notes text DEFAULT NULL,
  p_package_id bigint DEFAULT NULL,
  p_save_as_draft boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_tenant_id bigint;
  v_time_entry_id uuid;
  v_draft_id uuid;
  v_client_name text;
  v_active_package_id bigint;
  v_has_access boolean;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  -- Get tenant info - client_id IS tenant_id in this schema
  SELECT id, name INTO v_tenant_id, v_client_name 
  FROM public.tenants 
  WHERE id = p_client_id;
  
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'client_not_found');
  END IF;

  -- Check if user has access: SuperAdmin/staff OR connected to tenant
  SELECT EXISTS (
    -- Check if SuperAdmin or staff (Team Leader, Team Member)
    SELECT 1 FROM public.users 
    WHERE user_uuid = v_user_id
      AND (
        global_role IN ('superadmin', 'SuperAdmin')
        OR unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
      )
  ) OR EXISTS (
    -- Check if connected to this tenant
    SELECT 1 FROM public.connected_tenants 
    WHERE user_uuid = v_user_id AND tenant_id = v_tenant_id
  ) INTO v_has_access;

  IF NOT v_has_access THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;

  -- Validate minutes
  IF p_minutes <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_minutes');
  END IF;

  -- Determine package ID: use provided, or find active package
  IF p_package_id IS NOT NULL THEN
    v_active_package_id := p_package_id;
  ELSE
    -- Try to find an active package for this tenant
    SELECT pi.package_id INTO v_active_package_id
    FROM public.package_instances pi
    WHERE pi.tenant_id = v_tenant_id
      AND pi.is_complete = false
    ORDER BY pi.start_date DESC
    LIMIT 1;
    -- v_active_package_id may be NULL if no active package
  END IF;

  IF p_save_as_draft THEN
    -- Create as draft in calendar_time_drafts
    INSERT INTO public.calendar_time_drafts (
      tenant_id, created_by, calendar_event_id, client_id, package_id,
      minutes, work_date, notes, status, work_type, is_billable
    ) VALUES (
      v_tenant_id, v_user_id, p_calendar_event_id, p_client_id, v_active_package_id,
      p_minutes, p_work_date, p_notes, 'draft', 'meeting', true
    ) RETURNING id INTO v_draft_id;
    
    RETURN jsonb_build_object(
      'success', true,
      'draft_id', v_draft_id,
      'minutes_total', p_minutes,
      'status', 'draft',
      'client_name', v_client_name,
      'package_allocated', v_active_package_id IS NOT NULL
    );
  ELSE
    -- Create as posted time entry
    INSERT INTO public.time_entries (
      tenant_id, client_id, package_id, user_id, work_type, is_billable,
      start_at, duration_minutes, notes, source, calendar_event_id
    ) VALUES (
      v_tenant_id, p_client_id, v_active_package_id, v_user_id, 'meeting', true,
      (p_work_date::timestamp AT TIME ZONE 'UTC'), p_minutes, p_notes, 'calendar', p_calendar_event_id
    ) RETURNING id INTO v_time_entry_id;
    
    -- Log audit entry
    INSERT INTO public.client_audit_log (
      tenant_id, actor_user_id, action, entity_type, entity_id,
      before_data, after_data, details
    ) VALUES (
      v_tenant_id, v_user_id, 'meeting_time_import', 'time_entries', v_time_entry_id::text,
      '{}'::jsonb,
      jsonb_build_object('minutes', p_minutes, 'package_id', v_active_package_id),
      jsonb_build_object(
        'calendar_event_id', p_calendar_event_id,
        'reason', 'Imported from meeting'
      )
    );
    
    RETURN jsonb_build_object(
      'success', true,
      'time_entry_id', v_time_entry_id,
      'minutes_total', p_minutes,
      'status', 'posted',
      'client_name', v_client_name,
      'package_allocated', v_active_package_id IS NOT NULL
    );
  END IF;
END;
$$;