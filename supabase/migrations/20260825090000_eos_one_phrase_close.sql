-- Replaces the shared free-text "cascading messages" textarea in the L10
-- meeting Conclude segment with a per-attendee "one phrase close": each
-- attendee submits their own short phrase, shown live to everyone as the
-- meeting wraps up, and persisted into the meeting summary.

CREATE TABLE public.eos_meeting_one_phrase_closes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id uuid NOT NULL REFERENCES public.eos_meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  tenant_id bigint NOT NULL,
  phrase text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, user_id)
);

COMMENT ON TABLE public.eos_meeting_one_phrase_closes IS
  'One short reflection phrase per attendee for an L10 meeting''s Conclude segment. Replaces the old shared eos_meetings.notes "cascading messages" field.';

ALTER TABLE public.eos_meeting_one_phrase_closes ENABLE ROW LEVEL SECURITY;

-- Mirrors eos_meeting_ratings' policy shape exactly (same access model:
-- staff/tenant-scoped read, self-only write).
CREATE POLICY eos_meeting_one_phrase_closes_select_scoped
  ON public.eos_meeting_one_phrase_closes
  FOR SELECT
  USING (
    public.is_vivacity_team_safe((SELECT auth.uid()))
    OR public.has_tenant_access_safe(tenant_id, (SELECT auth.uid()))
  );

CREATE POLICY eos_meeting_one_phrase_closes_users_insert_own
  ON public.eos_meeting_one_phrase_closes
  FOR INSERT
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (SELECT 1 FROM public.eos_meetings m WHERE m.id = eos_meeting_one_phrase_closes.meeting_id)
  );

CREATE POLICY eos_meeting_one_phrase_closes_users_update_own
  ON public.eos_meeting_one_phrase_closes
  FOR UPDATE
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY eos_meeting_one_phrase_closes_users_delete_own
  ON public.eos_meeting_one_phrase_closes
  FOR DELETE
  USING (user_id = (SELECT auth.uid()));

-- Upsert RPC, mirroring save_meeting_rating's shape.
CREATE OR REPLACE FUNCTION public.save_one_phrase_close(p_meeting_id uuid, p_phrase text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id BIGINT;
  v_phrase text;
BEGIN
  v_phrase := btrim(p_phrase);

  IF v_phrase = '' OR v_phrase IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Phrase cannot be empty');
  END IF;

  IF length(v_phrase) > 140 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Keep it to one phrase - 140 characters or fewer');
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.eos_meetings WHERE id = p_meeting_id;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Meeting not found');
  END IF;

  INSERT INTO public.eos_meeting_one_phrase_closes (meeting_id, user_id, tenant_id, phrase)
  VALUES (p_meeting_id, auth.uid(), v_tenant_id, v_phrase)
  ON CONFLICT (meeting_id, user_id)
  DO UPDATE SET phrase = EXCLUDED.phrase, updated_at = now();

  RETURN jsonb_build_object('success', true, 'phrase', v_phrase);
END;
$function$;

-- Meeting summary gains a dedicated column for the per-attendee closes.
ALTER TABLE public.eos_meeting_summaries
  ADD COLUMN IF NOT EXISTS one_phrase_closes jsonb;

COMMENT ON COLUMN public.eos_meeting_summaries.cascades IS
  'Deprecated 2026-08-25 - the shared "cascading messages" textarea was replaced by per-attendee one_phrase_closes. Left in place for historical summaries; generate_meeting_summary() no longer writes to it.';

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
  v_one_phrase_closes jsonb;
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

  SELECT jsonb_agg(jsonb_build_object('user_id', user_id, 'phrase', phrase))
    INTO v_one_phrase_closes FROM eos_meeting_one_phrase_closes WHERE meeting_id = p_meeting_id;

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

  INSERT INTO eos_meeting_summaries (meeting_id, tenant_id, todos, issues, headlines, attendance, rocks, cascades, one_phrase_closes, segue_shares, rating)
  VALUES (p_meeting_id, v_meeting.tenant_id,
    COALESCE(v_todos, '[]'::jsonb), COALESCE(v_issues, '[]'::jsonb),
    COALESCE(v_headlines, '[]'::jsonb), COALESCE(v_participants, '[]'::jsonb),
    COALESCE(v_rocks, '[]'::jsonb), '[]'::jsonb, COALESCE(v_one_phrase_closes, '[]'::jsonb),
    COALESCE(v_segue, '[]'::jsonb), v_rating)
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
