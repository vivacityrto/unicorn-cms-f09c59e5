-- Update seed_meeting_attendees_from_roles to include Vivacity staff
CREATE OR REPLACE FUNCTION public.seed_meeting_attendees_from_roles(p_meeting_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting RECORD;
  v_inserted_count integer := 0;
  v_vivacity_count integer := 0;
BEGIN
  -- Get the meeting details
  SELECT * INTO v_meeting FROM public.eos_meetings WHERE id = p_meeting_id;
  
  IF v_meeting IS NULL THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;

  -- STEP 1: Insert from eos_user_roles (existing behavior)
  INSERT INTO public.eos_meeting_attendees (
    meeting_id, user_id, role_in_meeting, attendance_status, created_at, updated_at
  )
  SELECT
    p_meeting_id,
    ur.user_id,
    CASE ur.role
      WHEN 'visionary' THEN 'visionary'::meeting_role
      WHEN 'integrator' THEN 'integrator'::meeting_role
      ELSE 'core_team'::meeting_role
    END,
    'invited'::meeting_attendance_status,
    NOW(),
    NOW()
  FROM public.eos_user_roles ur
  WHERE ur.tenant_id = v_meeting.tenant_id
    AND NOT EXISTS (
      SELECT 1 FROM public.eos_meeting_attendees a
      WHERE a.meeting_id = p_meeting_id AND a.user_id = ur.user_id
    )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  -- STEP 2: Insert Vivacity staff (NEW)
  -- Include all users where user_type = 'Vivacity Team'
  INSERT INTO public.eos_meeting_attendees (
    meeting_id, user_id, role_in_meeting, attendance_status, created_at, updated_at
  )
  SELECT
    p_meeting_id,
    u.user_uuid,
    'core_team'::meeting_role,
    'invited'::meeting_attendance_status,
    NOW(),
    NOW()
  FROM public.users u
  WHERE u.user_type = 'Vivacity Team'
    AND u.disabled IS NOT TRUE
    AND NOT EXISTS (
      SELECT 1 FROM public.eos_meeting_attendees a
      WHERE a.meeting_id = p_meeting_id AND a.user_id = u.user_uuid
    )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_vivacity_count = ROW_COUNT;

  RETURN v_inserted_count + v_vivacity_count;
END;
$$;