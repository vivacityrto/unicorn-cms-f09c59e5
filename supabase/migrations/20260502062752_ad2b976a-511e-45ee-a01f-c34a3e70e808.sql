CREATE OR REPLACE FUNCTION public.rpc_import_meeting_time_to_client(
  p_client_id bigint,
  p_calendar_event_id uuid,
  p_minutes integer,
  p_work_date date,
  p_notes text DEFAULT NULL::text,
  p_package_instance_id bigint DEFAULT NULL::bigint,
  p_save_as_draft boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_tenant_id bigint;
  v_time_entry_id uuid;
  v_draft_id uuid;
  v_client_name text;
  v_package_instance_id bigint;
  v_base_package_id bigint;
  v_has_access boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT id, name INTO v_tenant_id, v_client_name FROM public.tenants WHERE id = p_client_id;
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'client_not_found');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = v_user_id
      AND (global_role IN ('superadmin','SuperAdmin')
           OR unicorn_role IN ('Super Admin','Team Leader','Team Member'))
  ) OR EXISTS (
    SELECT 1 FROM public.connected_tenants
    WHERE user_uuid = v_user_id AND tenant_id = v_tenant_id
  ) INTO v_has_access;

  IF NOT v_has_access THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;

  IF p_minutes <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_minutes');
  END IF;

  IF p_package_instance_id IS NOT NULL THEN
    SELECT pi.id, pi.package_id INTO v_package_instance_id, v_base_package_id
    FROM public.package_instances pi
    WHERE pi.id = p_package_instance_id AND pi.tenant_id = v_tenant_id;

    IF v_package_instance_id IS NULL THEN
      RETURN jsonb_build_object('success', false,
        'error', format('package_instance_id %s does not belong to tenant %s', p_package_instance_id, v_tenant_id));
    END IF;
  ELSE
    SELECT pi.id, pi.package_id INTO v_package_instance_id, v_base_package_id
    FROM public.package_instances pi
    WHERE pi.tenant_id = v_tenant_id AND pi.is_complete = false
    ORDER BY pi.start_date DESC LIMIT 1;
  END IF;

  IF p_save_as_draft THEN
    INSERT INTO public.calendar_time_drafts (
      tenant_id, created_by, calendar_event_id, client_id, package_id,
      minutes, work_date, notes, status, work_type, is_billable
    ) VALUES (
      v_tenant_id, v_user_id, p_calendar_event_id, p_client_id, v_base_package_id,
      p_minutes, p_work_date, p_notes, 'draft', 'meeting', true
    ) RETURNING id INTO v_draft_id;

    RETURN jsonb_build_object('success', true, 'draft_id', v_draft_id,
      'minutes_total', p_minutes, 'status', 'draft',
      'client_name', v_client_name, 'package_allocated', v_package_instance_id IS NOT NULL);
  ELSE
    -- Per system convention, time_entries.package_id stores the package_instance.id
    -- (validated by trigger fn_validate_time_entry_package). Use v_package_instance_id
    -- in BOTH columns; v_base_package_id (packages.id) is only used for the draft path.
    INSERT INTO public.time_entries (
      tenant_id, client_id, package_id, package_instance_id, user_id, work_type, is_billable,
      start_at, duration_minutes, notes, source, calendar_event_id
    ) VALUES (
      v_tenant_id, p_client_id, v_package_instance_id, v_package_instance_id, v_user_id, 'meeting', true,
      (p_work_date::timestamp AT TIME ZONE 'UTC'), p_minutes, p_notes, 'calendar', p_calendar_event_id
    ) RETURNING id INTO v_time_entry_id;

    INSERT INTO public.client_audit_log (
      tenant_id, actor_user_id, action, entity_type, entity_id,
      before_data, after_data, details
    ) VALUES (
      v_tenant_id, v_user_id, 'meeting_time_import', 'time_entries', v_time_entry_id::text,
      '{}'::jsonb,
      jsonb_build_object('minutes', p_minutes, 'package_id', v_package_instance_id, 'package_instance_id', v_package_instance_id, 'base_package_id', v_base_package_id),
      jsonb_build_object('calendar_event_id', p_calendar_event_id, 'reason', 'Imported from meeting')
    );

    RETURN jsonb_build_object('success', true, 'time_entry_id', v_time_entry_id,
      'minutes_total', p_minutes, 'status', 'posted',
      'client_name', v_client_name, 'package_allocated', v_package_instance_id IS NOT NULL);
  END IF;
END;
$function$;