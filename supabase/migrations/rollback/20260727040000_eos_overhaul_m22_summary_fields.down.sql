-- ============================================================
-- Rollback for 20260727040000_eos_overhaul_m22_summary_fields.sql
-- Restores generate_meeting_summary() to its pre-M22 form (rocks/
-- cascades hardcoded empty, rating never set, no segue_shares) and
-- drops the segue_shares column.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.generate_meeting_summary(p_meeting_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_meeting RECORD;
  v_summary_id uuid;
  v_todos jsonb;
  v_issues jsonb;
  v_rocks jsonb;
  v_headlines jsonb;
  v_participants jsonb;
BEGIN
  SELECT * INTO v_meeting FROM eos_meetings WHERE id = p_meeting_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Meeting not found'; END IF;

  SELECT id INTO v_summary_id FROM eos_meeting_summaries WHERE meeting_id = p_meeting_id;
  IF v_summary_id IS NOT NULL THEN RETURN v_summary_id; END IF;

  SELECT jsonb_agg(jsonb_build_object('id', id, 'title', title, 'owner_id', owner_id, 'due_date', due_date, 'status', status, 'completed_at', completed_at))
    INTO v_todos FROM eos_todos WHERE meeting_id = p_meeting_id;

  SELECT jsonb_agg(jsonb_build_object('id', id, 'title', title, 'status', status, 'priority', priority, 'solution', solution, 'solved_at', solved_at))
    INTO v_issues FROM eos_issues WHERE meeting_id = p_meeting_id;

  SELECT jsonb_agg(jsonb_build_object('id', id, 'headline', headline, 'is_good_news', is_good_news, 'user_id', user_id))
    INTO v_headlines FROM eos_headlines WHERE meeting_id = p_meeting_id;

  SELECT jsonb_agg(jsonb_build_object('user_id', user_id, 'role', role_in_meeting,
    'attended', CASE WHEN attendance_status IN ('attended', 'late', 'left_early') THEN true ELSE false END))
    INTO v_participants FROM eos_meeting_attendees WHERE meeting_id = p_meeting_id;

  INSERT INTO eos_meeting_summaries (meeting_id, tenant_id, todos, issues, headlines, attendance, rocks, cascades)
  VALUES (p_meeting_id, v_meeting.tenant_id,
    COALESCE(v_todos, '[]'::jsonb), COALESCE(v_issues, '[]'::jsonb),
    COALESCE(v_headlines, '[]'::jsonb), COALESCE(v_participants, '[]'::jsonb),
    '[]'::jsonb, '[]'::jsonb)
  RETURNING id INTO v_summary_id;

  UPDATE eos_meetings SET is_complete = true, completed_at = now() WHERE id = p_meeting_id;

  INSERT INTO audit_eos_events (tenant_id, user_id, meeting_id, entity, entity_id, action, reason, details)
  VALUES (v_meeting.tenant_id, auth.uid(), p_meeting_id, 'summary', v_summary_id, 'created',
    'Meeting summary generated',
    jsonb_build_object('todo_count', jsonb_array_length(COALESCE(v_todos, '[]'::jsonb)),
      'issue_count', jsonb_array_length(COALESCE(v_issues, '[]'::jsonb))));

  RETURN v_summary_id;
END;
$function$;

ALTER TABLE public.eos_meeting_summaries DROP COLUMN IF EXISTS segue_shares;

NOTIFY pgrst, 'reload schema';

COMMIT;
