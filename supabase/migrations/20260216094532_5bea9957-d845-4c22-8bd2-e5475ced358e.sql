-- 1. Delete the orphaned/invalid active timer
DELETE FROM public.active_timers WHERE id = 'd17ce7d1-bb34-4c76-8f19-1480ddbe01b7';

-- 2. Fix rpc_stop_timer to gracefully handle invalid package_ids
-- by nullifying package_id if it doesn't belong to the timer's tenant
CREATE OR REPLACE FUNCTION public.rpc_stop_timer()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_timer public.active_timers%ROWTYPE;
  v_duration_minutes integer;
  v_new_entry public.time_entries%ROWTYPE;
  v_valid_package_id integer;
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
  
  -- Validate package_id belongs to this tenant; null it out if invalid
  IF v_timer.package_id IS NOT NULL THEN
    SELECT id INTO v_valid_package_id
    FROM public.package_instances
    WHERE id = v_timer.package_id AND tenant_id = v_timer.tenant_id;
    
    IF v_valid_package_id IS NULL THEN
      v_timer.package_id := NULL;
    END IF;
  END IF;
  
  -- Insert time entry
  INSERT INTO public.time_entries (
    tenant_id, client_id, package_id, stage_id, task_id, user_id,
    work_type, is_billable, start_at, end_at, duration_minutes, notes, source
  )
  VALUES (
    v_timer.tenant_id, v_timer.client_id, v_timer.package_id, v_timer.stage_id, 
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
$$;