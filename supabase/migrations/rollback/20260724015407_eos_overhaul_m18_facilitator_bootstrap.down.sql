-- ============================================================
-- Rollback for 20260724015407_eos_overhaul_m18_facilitator_bootstrap.sql
-- Restores change_meeting_facilitator to its pre-M18 body, removing
-- the "no Leader exists yet" bootstrap bypass.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.change_meeting_facilitator(p_meeting_id uuid, p_new_facilitator_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_meeting RECORD;
  v_old_leader_id UUID;
BEGIN
  SELECT m.*, emp.role, emp.user_id INTO v_meeting
  FROM eos_meetings m
  LEFT JOIN eos_meeting_participants emp
    ON emp.meeting_id = m.id AND emp.user_id = auth.uid()
  WHERE m.id = p_meeting_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;

  IF v_meeting.role IS DISTINCT FROM 'Leader'
     AND NOT is_super_admin()
     AND NOT is_integrator_or_above(auth.uid()) THEN
    RAISE EXCEPTION 'Only current facilitator or admin can change facilitator';
  END IF;

  SELECT user_id INTO v_old_leader_id
  FROM eos_meeting_participants
  WHERE meeting_id = p_meeting_id AND role = 'Leader';

  UPDATE eos_meeting_participants
  SET role = 'Member'
  WHERE meeting_id = p_meeting_id AND role = 'Leader';

  UPDATE eos_meeting_participants
  SET role = 'Leader'
  WHERE meeting_id = p_meeting_id AND user_id = p_new_facilitator_id;

  IF NOT FOUND THEN
    INSERT INTO eos_meeting_participants (meeting_id, user_id, role, attended)
    VALUES (p_meeting_id, p_new_facilitator_id, 'Leader', false);
  END IF;

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
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
