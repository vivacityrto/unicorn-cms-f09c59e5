-- Let carried-over EOS to-dos be marked done / reopened after their meeting closes.
--
-- trg_protect_todos_in_completed_meeting used the shared protect_completed_meeting_data()
-- guard, which blocks EVERY update or delete of a to-do whose meeting is closed. Since
-- #1404 the live To-Do List segment shows open to-dos from earlier meetings so they can be
-- reviewed ("did you do it?"), but those to-dos belong to closed meetings, so ticking one
-- failed with "Cannot modify data for completed meeting".
--
-- To-dos are living items that carry over, so reviewing one is allowed. The new guard keeps
-- every other protection:
--   * status / completed_at / updated_at changes on a closed meeting's to-do: allowed
--   * any other column changed (title, owner, due date, meeting_id ...): blocked
--   * DELETE: blocked
--   * moving a to-do into a closed meeting: blocked
-- Other tables (eos_headlines) keep the shared protect_completed_meeting_data() function.
CREATE OR REPLACE FUNCTION public.protect_todos_in_completed_meeting()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
BEGIN
  -- Existing to-do: guard on the meeting it currently belongs to.
  IF OLD.meeting_id IS NOT NULL THEN
    SELECT status INTO v_status FROM eos_meetings WHERE id = OLD.meeting_id;
    IF v_status IN ('closed', 'completed') THEN
      IF TG_OP = 'UPDATE'
         AND (to_jsonb(NEW) - ARRAY['status', 'completed_at', 'updated_at'])
           = (to_jsonb(OLD) - ARRAY['status', 'completed_at', 'updated_at']) THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Cannot modify data for completed meeting. Create a new item instead.';
    END IF;
  END IF;

  -- Moving a to-do into a completed meeting is still blocked.
  IF TG_OP = 'UPDATE' AND NEW.meeting_id IS DISTINCT FROM OLD.meeting_id AND NEW.meeting_id IS NOT NULL THEN
    SELECT status INTO v_status FROM eos_meetings WHERE id = NEW.meeting_id;
    IF v_status IN ('closed', 'completed') THEN
      RAISE EXCEPTION 'Cannot modify data for completed meeting. Create a new item instead.';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_protect_todos_in_completed_meeting ON public.eos_todos;
CREATE TRIGGER trg_protect_todos_in_completed_meeting
  BEFORE DELETE OR UPDATE ON public.eos_todos
  FOR EACH ROW EXECUTE FUNCTION public.protect_todos_in_completed_meeting();
