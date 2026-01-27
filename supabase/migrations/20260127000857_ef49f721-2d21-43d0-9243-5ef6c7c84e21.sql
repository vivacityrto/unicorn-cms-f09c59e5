-- Reset meeting segments for testing
UPDATE eos_meeting_segments 
SET started_at = NULL, completed_at = NULL
WHERE meeting_id = '64a80954-66e0-40b6-b595-0fa68a1ec4bb';

-- Create RPC function to change facilitator
CREATE OR REPLACE FUNCTION public.change_meeting_facilitator(
  p_meeting_id UUID,
  p_new_facilitator_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting RECORD;
  v_old_leader_id UUID;
BEGIN
  -- Get meeting and verify permissions
  SELECT m.*, emp.role, emp.user_id INTO v_meeting
  FROM eos_meetings m
  LEFT JOIN eos_meeting_participants emp 
    ON emp.meeting_id = m.id AND emp.user_id = auth.uid()
  WHERE m.id = p_meeting_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;

  -- Only current Leader or SuperAdmin can change facilitator
  IF v_meeting.role IS DISTINCT FROM 'Leader' AND NOT is_super_admin() THEN
    RAISE EXCEPTION 'Only current facilitator or admin can change facilitator';
  END IF;

  -- Get current leader
  SELECT user_id INTO v_old_leader_id
  FROM eos_meeting_participants
  WHERE meeting_id = p_meeting_id AND role = 'Leader';

  -- Demote old leader to Member
  UPDATE eos_meeting_participants
  SET role = 'Member'
  WHERE meeting_id = p_meeting_id AND role = 'Leader';

  -- Promote new facilitator to Leader
  UPDATE eos_meeting_participants
  SET role = 'Leader'
  WHERE meeting_id = p_meeting_id AND user_id = p_new_facilitator_id;

  -- If new facilitator wasn't a participant, add them
  IF NOT FOUND THEN
    INSERT INTO eos_meeting_participants (meeting_id, user_id, role, attended)
    VALUES (p_meeting_id, p_new_facilitator_id, 'Leader', false);
  END IF;

  -- Audit log
  INSERT INTO audit_eos_events (
    tenant_id, user_id, meeting_id, entity, action, details
  ) VALUES (
    v_meeting.tenant_id,
    auth.uid(),
    p_meeting_id,
    'meeting',
    'facilitator_changed',
    jsonb_build_object(
      'old_facilitator', v_old_leader_id,
      'new_facilitator', p_new_facilitator_id
    )
  );

  RETURN true;
END;
$$;