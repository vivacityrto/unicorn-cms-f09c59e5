-- Rollback for 20261031054829_rock_notes_crud.sql.
-- Existing note bodies remain as edited; hard-deleted notes cannot be restored.

REVOKE UPDATE (body), DELETE ON public.eos_rock_notes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.eos_rock_notes TO authenticated;
DROP POLICY IF EXISTS eos_rock_notes_update ON public.eos_rock_notes;
DROP POLICY IF EXISTS eos_rock_notes_delete ON public.eos_rock_notes;

DROP TRIGGER IF EXISTS trg_eos_rock_notes_crud_guard ON public.eos_rock_notes;
DROP FUNCTION IF EXISTS public.enforce_eos_rock_notes_mutations();

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
CREATE TRIGGER trg_eos_rock_notes_append_only
  BEFORE UPDATE OR DELETE ON public.eos_rock_notes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_eos_rock_notes_append_only();

ALTER TABLE public.eos_rock_notes DROP COLUMN IF EXISTS edited_at;
NOTIFY pgrst, 'reload schema';
