
CREATE OR REPLACE FUNCTION public.add_meeting_guest(
  p_meeting_id UUID,
  p_user_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting RECORD;
BEGIN
  SELECT * INTO v_meeting FROM eos_meetings WHERE id = p_meeting_id;
  
  IF v_meeting IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Meeting not found');
  END IF;
  
  INSERT INTO eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status, notes, marked_by)
  VALUES (p_meeting_id, p_user_id, 'guest', 'attended', p_notes, auth.uid())
  ON CONFLICT (meeting_id, user_id) DO NOTHING;
  
  -- Log audit event (removed ::TEXT cast — entity_id is UUID)
  INSERT INTO audit_eos_events (tenant_id, meeting_id, entity, action, entity_id, user_id, details)
  VALUES (
    v_meeting.tenant_id,
    p_meeting_id,
    'attendance',
    'guest_added',
    p_user_id,
    auth.uid(),
    jsonb_build_object('guest_user_id', p_user_id, 'notes', p_notes)
  );
  
  RETURN jsonb_build_object('success', true);
END;
$$;
