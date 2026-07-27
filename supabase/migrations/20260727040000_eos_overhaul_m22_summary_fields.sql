-- ============================================================
-- EOS Meeting Overhaul — Migration 22 (summary gaps)
-- Hand-authored hotfix, applied via explicit override (root CLAUDE.md),
-- re-confirmed in-session 2026-07-27.
--
-- generate_meeting_summary() was found to hardcode rocks and cascades to
-- '[]'::jsonb (never actually queried), and never set rating at all
-- (column omitted from the INSERT entirely) - so three of the seven
-- summary sections silently never had real data, despite the frontend
-- card already being written to render them. Also adds eos_segue_shares
-- (M21) to the summary, since that table didn't exist when this RPC was
-- last written.
--
-- rocks snapshot mirrors the exact filter LiveMeetingView's Rock Review
-- segment already uses live (current quarter, excludes 'complete',
-- scoped by the meeting-type's Configuration rocks_scope - defaulting to
-- company+team when no Configuration/scope exists, matching the
-- frontend's own default) - not reinvented here.
-- rating is the average of eos_meeting_ratings for this meeting, rounded
-- to the nearest whole number (ratings are individual 1-10 submissions,
-- one row per participant - see the plan's "each participant submits
-- their own" decision).
-- cascades reads eos_meetings.notes (the single field the live view's
-- Conclude segment actually saves to via saveCascadingMessages) rather
-- than a separate structured table, since none exists.
--
-- Existing summaries (meetings closed before this migration) are not
-- backfilled - generate_meeting_summary() already early-returns for a
-- meeting that has a summary row, so this only affects meetings closed
-- from here on, consistent with how every other fix this session has
-- worked (forward-only, no retroactive rewrite).
-- ============================================================

BEGIN;

ALTER TABLE public.eos_meeting_summaries
  ADD COLUMN IF NOT EXISTS segue_shares jsonb DEFAULT '[]'::jsonb;

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
  v_segue jsonb;
  v_rating integer;
  v_cascades jsonb;
  v_rocks_scope text[];
  v_quarter_year integer;
  v_quarter_number integer;
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

  SELECT jsonb_agg(jsonb_build_object('id', id, 'personal_win', personal_win, 'professional_win', professional_win, 'rating', rating, 'user_id', user_id))
    INTO v_segue FROM eos_segue_shares WHERE meeting_id = p_meeting_id;

  SELECT jsonb_agg(jsonb_build_object('user_id', user_id, 'role', role_in_meeting,
    'attended', CASE WHEN attendance_status IN ('attended', 'late', 'left_early') THEN true ELSE false END))
    INTO v_participants FROM eos_meeting_attendees WHERE meeting_id = p_meeting_id;

  SELECT ROUND(AVG(rating))::integer INTO v_rating
  FROM eos_meeting_ratings WHERE meeting_id = p_meeting_id;

  v_cascades := CASE
    WHEN v_meeting.notes IS NOT NULL AND btrim(v_meeting.notes) <> ''
    THEN jsonb_build_array(jsonb_build_object('message', v_meeting.notes))
    ELSE '[]'::jsonb
  END;

  v_quarter_year := EXTRACT(YEAR FROM now());
  v_quarter_number := CEIL(EXTRACT(MONTH FROM now()) / 3.0);

  SELECT COALESCE(c.rocks_scope, ARRAY['company', 'team']) INTO v_rocks_scope
  FROM eos_configurations c
  WHERE c.tenant_id = v_meeting.tenant_id AND c.meeting_type = v_meeting.meeting_type;

  IF v_rocks_scope IS NULL THEN
    v_rocks_scope := ARRAY['company', 'team'];
  END IF;

  SELECT jsonb_agg(jsonb_build_object('id', id, 'title', title, 'status', status, 'rock_level', rock_level, 'owner_id', owner_id))
  INTO v_rocks
  FROM eos_rocks
  WHERE tenant_id = v_meeting.tenant_id
    AND quarter_year = v_quarter_year
    AND quarter_number = v_quarter_number
    AND status <> 'complete'
    AND (array_length(v_rocks_scope, 1) IS NULL OR rock_level = ANY(v_rocks_scope));

  INSERT INTO eos_meeting_summaries (meeting_id, tenant_id, todos, issues, headlines, attendance, rocks, cascades, segue_shares, rating)
  VALUES (p_meeting_id, v_meeting.tenant_id,
    COALESCE(v_todos, '[]'::jsonb), COALESCE(v_issues, '[]'::jsonb),
    COALESCE(v_headlines, '[]'::jsonb), COALESCE(v_participants, '[]'::jsonb),
    COALESCE(v_rocks, '[]'::jsonb), v_cascades, COALESCE(v_segue, '[]'::jsonb), v_rating)
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

NOTIFY pgrst, 'reload schema';

COMMIT;
