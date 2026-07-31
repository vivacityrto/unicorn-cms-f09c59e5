-- ============================================================
-- Fix start_meeting_with_quorum_check referencing nonexistent
-- eos_meeting_segments columns
--
-- Hand-authored hotfix, applied directly to prod via Supabase MCP
-- (execute_sql) with Carl's explicit approval, then committed here to
-- keep migration history in sync per project convention.
--
-- The function's agenda_snapshot builder read s.title / s.sort_order
-- from eos_meeting_segments, but those columns have never existed on
-- that table - the real columns are segment_name / sequence_order
-- (see 20260723072952_eos_overhaul_m9_meeting_segment_type.sql, which
-- correctly uses segment_name/sequence_order in every other function
-- that touches this table). This function was never updated to match,
-- so every call to "Start Meeting" - for every EOS meeting type -
-- failed outright with "column s.title does not exist".
--
-- Discovered while seeding a throwaway test L10 meeting to dry-run the
-- live meeting flow ahead of Vivacity's real Aug 3 2026 L10. Verified
-- live: reproduced the exact error against the test meeting's segments,
-- applied this fix, then successfully called the RPC end-to-end
-- (meeting transitioned to in_progress with a valid agenda_snapshot).
--
-- JSON output keys ('title', 'sort_order') are kept as-is - only the
-- source column references are corrected. agenda_snapshot is write-only
-- from the frontend's perspective (never destructured for those keys
-- anywhere in src/), so this is a pure bugfix with no behavior change
-- for any consumer.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.start_meeting_with_quorum_check(p_meeting_id uuid, p_override_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_meeting RECORD;
  v_quorum RECORD;
BEGIN
  SELECT * INTO v_meeting FROM eos_meetings WHERE id = p_meeting_id;

  IF v_meeting IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Meeting not found');
  END IF;

  IF v_meeting.status NOT IN ('scheduled', 'Scheduled') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Meeting is not in scheduled state');
  END IF;

  SELECT * INTO v_quorum FROM calculate_quorum(p_meeting_id);

  -- Only Same Page meetings are hard-blocked
  IF v_meeting.meeting_type = 'Same_Page' AND NOT v_quorum.quorum_met AND p_override_reason IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Cannot start Same Page meeting without Visionary and Integrator',
      'quorum', row_to_json(v_quorum),
      'requires_override', false,
      'blocked', true
    );
  END IF;

  -- For all other types: if quorum not met, just proceed with a note (no override needed)
  -- Meeting can always start as long as at least 1 person is present

  UPDATE eos_meetings
  SET
    status = 'in_progress',
    started_at = now(),
    quorum_met = v_quorum.quorum_met,
    quorum_override_reason = p_override_reason,
    quorum_override_by = CASE WHEN p_override_reason IS NOT NULL THEN auth.uid() ELSE NULL END,
    agenda_snapshot = (
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id,
        'title', s.segment_name,
        'segment_type', s.segment_type,
        'duration_minutes', s.duration_minutes,
        'sort_order', s.sequence_order
      ) ORDER BY s.sequence_order)
      FROM eos_meeting_segments s
      WHERE s.meeting_id = p_meeting_id
    ),
    updated_at = now()
  WHERE id = p_meeting_id;

  INSERT INTO audit_eos_events (tenant_id, meeting_id, entity, action, user_id, details)
  SELECT
    v_meeting.tenant_id,
    p_meeting_id,
    'meeting',
    CASE WHEN v_quorum.quorum_met THEN 'meeting_started' ELSE 'meeting_started_without_quorum' END,
    auth.uid(),
    jsonb_build_object(
      'quorum_met', v_quorum.quorum_met,
      'override_reason', p_override_reason,
      'quorum_details', row_to_json(v_quorum)
    );

  RETURN jsonb_build_object(
    'success', true,
    'quorum_met', v_quorum.quorum_met,
    'quorum', row_to_json(v_quorum)
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;
