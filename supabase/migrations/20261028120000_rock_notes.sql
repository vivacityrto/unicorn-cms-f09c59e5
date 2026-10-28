-- Rock notes: a dated, append-only record of what was said about a Rock.
--
-- 1. eos_rock_notes: short executive-summary notes on a Rock, written during an L10 or at
--    any other time. Each note keeps who wrote it, when, the meeting it came from (if any)
--    and the Rock's status and milestone progress AT THAT MOMENT, so the notes read as a
--    progression. Append-only: no edits and no deletes (a trigger refuses both); the only
--    permitted change is a meeting being deleted, which clears the note's meeting link.
--    Written only through add_rock_note() (staff-only); read follows the Rock's own rules.
-- 2. eos_rock_note_summaries: an AI-written summary of a Rock's notes (and the notes of
--    the Rocks under it), kept as history. Never a source of truth: the notes are. Written
--    only by the summarise-rock-notes Edge Function (service role); read like the notes.
-- 3. rock_delete_blockers() also refuses to delete a Rock that has notes.
--
-- Additive; no existing row is changed.
-- Rollback: rollback/20261028120000_rock_notes.down.sql

-- 1. Notes ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.eos_rock_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL,
  rock_id uuid NOT NULL REFERENCES public.eos_rocks(id) ON DELETE RESTRICT,
  meeting_id uuid REFERENCES public.eos_meetings(id) ON DELETE SET NULL,
  body text NOT NULL,
  source text NOT NULL DEFAULT 'typed',
  rock_status text,
  milestones_complete integer,
  milestones_total integer,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eos_rock_notes_body_check CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  CONSTRAINT eos_rock_notes_source_check CHECK (source IN ('typed', 'dictated')),
  CONSTRAINT eos_rock_notes_progress_check CHECK (
    (milestones_complete IS NULL AND milestones_total IS NULL)
    OR (milestones_complete >= 0 AND milestones_total >= milestones_complete)
  )
);

CREATE INDEX IF NOT EXISTS idx_eos_rock_notes_rock ON public.eos_rock_notes (rock_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eos_rock_notes_meeting ON public.eos_rock_notes (meeting_id) WHERE meeting_id IS NOT NULL;

ALTER TABLE public.eos_rock_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eos_rock_notes_select ON public.eos_rock_notes;
CREATE POLICY eos_rock_notes_select ON public.eos_rock_notes
  FOR SELECT TO authenticated
  USING (
    public.is_vivacity_team_user((SELECT auth.uid()))
    OR public.has_any_eos_role((SELECT auth.uid()), tenant_id)
    OR public.is_super_admin()
  );

REVOKE ALL ON public.eos_rock_notes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.eos_rock_notes TO authenticated;

-- Append-only. The one allowed change is a deleted meeting clearing meeting_id.
CREATE OR REPLACE FUNCTION public.enforce_eos_rock_notes_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.meeting_id IS NOT NULL AND NEW.meeting_id IS NULL
     AND (to_jsonb(NEW) - 'meeting_id') = (to_jsonb(OLD) - 'meeting_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Rock notes are a permanent record and cannot be changed or deleted';
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_eos_rock_notes_append_only() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_eos_rock_notes_append_only ON public.eos_rock_notes;
CREATE TRIGGER trg_eos_rock_notes_append_only
  BEFORE UPDATE OR DELETE ON public.eos_rock_notes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_eos_rock_notes_append_only();

-- Adds a note. Staff only. The status and progress are read here, from the database, so a
-- note always records what was true when it was written rather than what a screen believed.
-- Saving the same text twice in quick succession (a double click, a retry) returns the first.
CREATE OR REPLACE FUNCTION public.add_rock_note(
  p_rock_id uuid,
  p_body text,
  p_meeting_id uuid DEFAULT NULL,
  p_source text DEFAULT 'typed'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tenant bigint;
  v_status text;
  v_archived timestamptz;
  v_body text;
  v_complete integer;
  v_total integer;
  v_existing public.eos_rock_notes%ROWTYPE;
  v_id uuid;
  v_created timestamptz;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;
  IF p_source NOT IN ('typed', 'dictated') THEN
    RAISE EXCEPTION 'A note is either typed or dictated';
  END IF;

  v_body := btrim(COALESCE(p_body, ''));
  IF v_body = '' THEN
    RAISE EXCEPTION 'A note needs some text';
  END IF;
  IF length(v_body) > 4000 THEN
    RAISE EXCEPTION 'A note can be at most 4000 characters';
  END IF;

  SELECT tenant_id, status, archived_at INTO v_tenant, v_status, v_archived
  FROM public.eos_rocks WHERE id = p_rock_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not found';
  END IF;
  IF v_archived IS NOT NULL THEN
    RAISE EXCEPTION 'An archived Rock cannot take new notes';
  END IF;

  IF p_meeting_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.eos_meetings WHERE id = p_meeting_id) THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;

  SELECT * INTO v_existing
  FROM public.eos_rock_notes
  WHERE rock_id = p_rock_id AND created_by = auth.uid() AND body = v_body
    AND created_at > now() - interval '30 seconds'
  ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('note_id', v_existing.id, 'created_at', v_existing.created_at, 'duplicate', true);
  END IF;

  -- Same counting as the Rock screens: deferred milestones are not part of the total.
  SELECT count(*) FILTER (WHERE status = 'complete'), count(*) FILTER (WHERE status <> 'deferred')
    INTO v_complete, v_total
  FROM public.eos_rock_milestones WHERE rock_id = p_rock_id;

  INSERT INTO public.eos_rock_notes
    (tenant_id, rock_id, meeting_id, body, source, rock_status, milestones_complete, milestones_total, created_by)
  VALUES
    (v_tenant, p_rock_id, p_meeting_id, v_body, p_source, v_status, v_complete, v_total, auth.uid())
  RETURNING id, created_at INTO v_id, v_created;

  RETURN jsonb_build_object('note_id', v_id, 'created_at', v_created, 'duplicate', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.add_rock_note(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_rock_note(uuid, text, uuid, text) TO authenticated;

-- 2. AI summaries --------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.eos_rock_note_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL,
  rock_id uuid NOT NULL REFERENCES public.eos_rocks(id) ON DELETE RESTRICT,
  summary text NOT NULL,
  status_signal text NOT NULL DEFAULT 'unclear',
  suggested_todos jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes_through timestamptz NOT NULL,
  note_count integer NOT NULL,
  rocks_included integer NOT NULL DEFAULT 1,
  model text,
  generated_by uuid REFERENCES auth.users(id),
  generated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eos_rock_note_summaries_signal_check CHECK (status_signal IN ('on_track', 'at_risk', 'off_track', 'unclear')),
  CONSTRAINT eos_rock_note_summaries_summary_check CHECK (length(btrim(summary)) BETWEEN 1 AND 4000),
  CONSTRAINT eos_rock_note_summaries_todos_check CHECK (jsonb_typeof(suggested_todos) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_eos_rock_note_summaries_rock ON public.eos_rock_note_summaries (rock_id, generated_at DESC);

ALTER TABLE public.eos_rock_note_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eos_rock_note_summaries_select ON public.eos_rock_note_summaries;
CREATE POLICY eos_rock_note_summaries_select ON public.eos_rock_note_summaries
  FOR SELECT TO authenticated
  USING (
    public.is_vivacity_team_user((SELECT auth.uid()))
    OR public.has_any_eos_role((SELECT auth.uid()), tenant_id)
    OR public.is_super_admin()
  );

REVOKE ALL ON public.eos_rock_note_summaries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.eos_rock_note_summaries TO authenticated;
-- service_role keeps its default grants: the Edge Function is the only writer.

-- 3. A Rock with notes is history: it is archived, not deleted -----------------------

CREATE OR REPLACE FUNCTION public.rock_delete_blockers(p_rock_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT array_remove(ARRAY[
    CASE WHEN EXISTS (SELECT 1 FROM public.eos_rocks c WHERE c.parent_rock_id = p_rock_id)
      THEN 'children' END,
    CASE WHEN EXISTS (SELECT 1 FROM public.eos_issues i WHERE i.linked_rock_id = p_rock_id)
      THEN 'linked_issues' END,
    CASE WHEN EXISTS (SELECT 1 FROM public.eos_rock_milestones m
                      WHERE m.rock_id = p_rock_id AND (m.status <> 'not_started' OR m.evidence_url IS NOT NULL))
      THEN 'milestone_progress' END,
    CASE WHEN EXISTS (SELECT 1 FROM public.eos_rock_milestone_task_links t
                      JOIN public.eos_rock_milestones m ON m.id = t.milestone_id
                      WHERE m.rock_id = p_rock_id)
      THEN 'task_links' END,
    CASE WHEN EXISTS (SELECT 1 FROM public.eos_rock_milestone_links l
                      JOIN public.eos_rock_milestones m ON m.id IN (l.company_milestone_id, l.individual_milestone_id)
                      WHERE m.rock_id = p_rock_id)
      THEN 'milestone_links' END,
    CASE WHEN EXISTS (SELECT 1 FROM public.rock_outcomes o WHERE o.rock_id = p_rock_id)
      THEN 'outcomes' END,
    CASE WHEN EXISTS (SELECT 1 FROM public.eos_rock_carryovers c
                      WHERE c.source_rock_id = p_rock_id OR c.destination_rock_id = p_rock_id)
      THEN 'carryover' END,
    CASE WHEN EXISTS (SELECT 1 FROM public.eos_rock_notes n WHERE n.rock_id = p_rock_id)
      THEN 'notes' END
  ]::text[], NULL);
$function$;

REVOKE ALL ON FUNCTION public.rock_delete_blockers(uuid) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
