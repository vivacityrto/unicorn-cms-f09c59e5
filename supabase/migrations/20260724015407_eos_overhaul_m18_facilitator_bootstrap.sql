-- ============================================================
-- EOS Meeting Overhaul — Migration 18 (facilitator bootstrap escape hatch)
-- Hand-authored hotfix, applied via explicit override (root CLAUDE.md,
-- 2026-07-23). Apply in the 22:00-04:00 AEST off-peak window per
-- project convention.
--
-- Gap found by Cursor Bugbot review on PR #39, following directly from
-- the round-14 fix that required a facilitator to be selected before
-- Start Meeting is enabled: change_meeting_facilitator(uuid, uuid) - a
-- pre-existing function, not touched anywhere else in this overhaul -
-- only allows the current Leader, Super Admin, or Integrator-or-above
-- to call it. With all 4 Configurations' facilitator_seat_id still
-- null (M2's known gap), a brand-new meeting has NO Leader at all, so
-- an ordinary staff attendee opening Start Meeting, picking a
-- facilitator, and clicking Start would have that pick rejected by
-- this RPC (they're not Leader - nobody is - and not admin-tier) -
-- Start Meeting fails outright for anyone who isn't Super Admin/Team
-- Leader/Integrator. This is a genuine bootstrap gap in the RPC's own
-- authorization model, not something the plan's tier-2 definition
-- ("current Leader, Super Admin, or Integrator-or-above" - lines
-- 108/70/73) ever addresses, since the plan assumes a Configuration's
-- facilitator seat normally pre-populates a Leader at generation time.
--
-- Fix: add a bypass for the specific case where the meeting genuinely
-- has no Leader participant yet - anyone can set the FIRST facilitator
-- in that case. Once a Leader exists, the tier-2 model applies exactly
-- as before (current Leader, Super Admin, or Integrator-or-above only)
-- for any subsequent reassignment. Nothing else in this function
-- changes.
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
  v_has_leader BOOLEAN;
BEGIN
  SELECT m.*, emp.role, emp.user_id INTO v_meeting
  FROM eos_meetings m
  LEFT JOIN eos_meeting_participants emp
    ON emp.meeting_id = m.id AND emp.user_id = auth.uid()
  WHERE m.id = p_meeting_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM eos_meeting_participants
    WHERE meeting_id = p_meeting_id AND role = 'Leader'
  ) INTO v_has_leader;

  IF v_meeting.role IS DISTINCT FROM 'Leader'
     AND NOT is_super_admin()
     AND NOT is_integrator_or_above(auth.uid())
     AND v_has_leader THEN
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
