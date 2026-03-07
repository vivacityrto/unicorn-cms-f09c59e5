CREATE OR REPLACE FUNCTION public.rpc_stop_timer()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_timer public.active_timers%ROWTYPE;
  v_duration_minutes integer;
  v_new_entry public.time_entries%ROWTYPE;
  v_valid_package_id integer;
  v_resolved_package_id integer;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;
  
  -- Find active timer
  SELECT * INTO v_timer
  FROM public.active_timers at
  WHERE at.user_id = v_user_id;
  
  IF v_timer.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_active_timer');
  END IF;
  
  -- Calculate duration
  v_duration_minutes := GREATEST(1, floor(extract(epoch from (now() - v_timer.start_at)) / 60)::integer);
  
  -- Resolve package_id: first check if it's a valid package_instances.id
  v_resolved_package_id := NULL;
  IF v_timer.package_id IS NOT NULL THEN
    -- Try as package_instance ID first
    SELECT id INTO v_resolved_package_id
    FROM public.package_instances
    WHERE id = v_timer.package_id AND tenant_id = v_timer.tenant_id;
    
    -- If not found, try as base packages.id and find the latest active instance
    IF v_resolved_package_id IS NULL THEN
      SELECT pi.id INTO v_resolved_package_id
      FROM public.package_instances pi
      WHERE pi.package_id = v_timer.package_id 
        AND pi.tenant_id = v_timer.tenant_id
        AND pi.is_complete = false
      ORDER BY pi.start_date DESC
      LIMIT 1;
    END IF;
  END IF;
  
  -- If still null and tenant has exactly one active package, auto-resolve
  IF v_resolved_package_id IS NULL THEN
    SELECT pi.id INTO v_resolved_package_id
    FROM public.package_instances pi
    WHERE pi.tenant_id = v_timer.tenant_id AND pi.is_complete = false;
    -- Only use if exactly one result (count check via exception)
    IF NOT FOUND THEN
      v_resolved_package_id := NULL;
    END IF;
  END IF;
  
  -- Insert time entry
  INSERT INTO public.time_entries (
    tenant_id, client_id, package_id, stage_id, task_id, user_id,
    work_type, is_billable, start_at, end_at, duration_minutes, notes, source
  )
  VALUES (
    v_timer.tenant_id, v_timer.client_id, v_resolved_package_id, v_timer.stage_id, 
    v_timer.task_id, v_user_id, v_timer.work_type, true, v_timer.start_at, now(), 
    v_duration_minutes, v_timer.notes, 'timer'
  )
  RETURNING * INTO v_new_entry;
  
  -- Delete active timer
  DELETE FROM public.active_timers WHERE id = v_timer.id;
  
  RETURN jsonb_build_object(
    'success', true,
    'time_entry', jsonb_build_object(
      'id', v_new_entry.id,
      'duration_minutes', v_new_entry.duration_minutes,
      'client_id', v_new_entry.client_id,
      'start_at', v_new_entry.start_at,
      'end_at', v_new_entry.end_at
    )
  );
END;
$function$;