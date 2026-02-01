-- Create function to seed attendees from EOS user roles when meeting is created
CREATE OR REPLACE FUNCTION public.seed_meeting_attendees_from_roles(p_meeting_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting RECORD;
  v_inserted INTEGER := 0;
BEGIN
  -- Get meeting details
  SELECT * INTO v_meeting
  FROM public.eos_meetings
  WHERE id = p_meeting_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;

  -- Insert attendees from eos_user_roles for this tenant
  INSERT INTO public.eos_meeting_attendees (
    meeting_id,
    user_id,
    role_in_meeting,
    attendance_status,
    created_at,
    updated_at
  )
  SELECT
    p_meeting_id,
    ur.user_id,
    CASE 
      WHEN ur.role = 'visionary' THEN 'visionary'::meeting_role
      WHEN ur.role = 'integrator' THEN 'integrator'::meeting_role
      ELSE 'attendee'::meeting_role
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

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- If no EOS roles exist, try to add the meeting creator as owner
  IF v_inserted = 0 AND v_meeting.created_by IS NOT NULL THEN
    INSERT INTO public.eos_meeting_attendees (
      meeting_id,
      user_id,
      role_in_meeting,
      attendance_status,
      created_at,
      updated_at
    ) VALUES (
      p_meeting_id,
      v_meeting.created_by,
      'owner'::meeting_role,
      'invited'::meeting_attendance_status,
      NOW(),
      NOW()
    )
    ON CONFLICT DO NOTHING;
    
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END IF;

  RETURN v_inserted;
END;
$$;

-- Create function to add attendee before meeting starts
CREATE OR REPLACE FUNCTION public.add_meeting_attendee(
  p_meeting_id UUID,
  p_user_id UUID,
  p_role meeting_role DEFAULT 'attendee'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting RECORD;
  v_attendee_id UUID;
BEGIN
  -- Get meeting and verify it hasn't started
  SELECT * INTO v_meeting
  FROM public.eos_meetings
  WHERE id = p_meeting_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;

  -- Only allow adding attendees before meeting goes live
  IF v_meeting.status = 'live' THEN
    RAISE EXCEPTION 'Cannot add attendees to a live meeting. Use add_meeting_guest instead.';
  END IF;

  IF v_meeting.status = 'ended' THEN
    RAISE EXCEPTION 'Cannot add attendees to an ended meeting';
  END IF;

  -- Insert or update attendee
  INSERT INTO public.eos_meeting_attendees (
    meeting_id,
    user_id,
    role_in_meeting,
    attendance_status,
    created_at,
    updated_at
  ) VALUES (
    p_meeting_id,
    p_user_id,
    p_role,
    'invited'::meeting_attendance_status,
    NOW(),
    NOW()
  )
  ON CONFLICT (meeting_id, user_id) DO UPDATE SET
    role_in_meeting = EXCLUDED.role_in_meeting,
    updated_at = NOW()
  RETURNING id INTO v_attendee_id;

  RETURN v_attendee_id;
END;
$$;

-- Create function to remove attendee before meeting starts
CREATE OR REPLACE FUNCTION public.remove_meeting_attendee(
  p_meeting_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting RECORD;
BEGIN
  -- Get meeting and verify it hasn't started
  SELECT * INTO v_meeting
  FROM public.eos_meetings
  WHERE id = p_meeting_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;

  IF v_meeting.status IN ('live', 'ended') THEN
    RAISE EXCEPTION 'Cannot remove attendees from a live or ended meeting';
  END IF;

  DELETE FROM public.eos_meeting_attendees
  WHERE meeting_id = p_meeting_id AND user_id = p_user_id;

  RETURN FOUND;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.seed_meeting_attendees_from_roles(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_meeting_attendee(UUID, UUID, meeting_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_meeting_attendee(UUID, UUID) TO authenticated;