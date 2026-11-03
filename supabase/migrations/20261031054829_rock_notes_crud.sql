-- Complete Rock note CRUD without changing the Rock snapshot or author/meeting metadata.
-- Existing rows remain readable; only Vivacity staff authors and Super Admins may edit/delete.

ALTER TABLE public.eos_rock_notes
  ADD COLUMN edited_at timestamptz;

DROP POLICY IF EXISTS eos_rock_notes_update ON public.eos_rock_notes;
CREATE POLICY eos_rock_notes_update ON public.eos_rock_notes
  FOR UPDATE TO authenticated
  USING (
    public.is_vivacity_team_safe((SELECT auth.uid()))
    AND (created_by = (SELECT auth.uid()) OR public.is_super_admin())
  )
  WITH CHECK (
    public.is_vivacity_team_safe((SELECT auth.uid()))
    AND (created_by = (SELECT auth.uid()) OR public.is_super_admin())
  );

DROP POLICY IF EXISTS eos_rock_notes_delete ON public.eos_rock_notes;
CREATE POLICY eos_rock_notes_delete ON public.eos_rock_notes
  FOR DELETE TO authenticated
  USING (
    public.is_vivacity_team_safe((SELECT auth.uid()))
    AND (created_by = (SELECT auth.uid()) OR public.is_super_admin())
  );

REVOKE INSERT, UPDATE, DELETE ON public.eos_rock_notes FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (body) ON public.eos_rock_notes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.eos_rock_notes TO authenticated;
GRANT UPDATE (body) ON public.eos_rock_notes TO authenticated;
GRANT DELETE ON public.eos_rock_notes TO authenticated;

DROP TRIGGER IF EXISTS trg_eos_rock_notes_append_only ON public.eos_rock_notes;
DROP FUNCTION IF EXISTS public.enforce_eos_rock_notes_append_only();

CREATE FUNCTION public.enforce_eos_rock_notes_mutations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- A meeting deletion may still clear its optional note link without changing the note.
  IF TG_OP = 'UPDATE'
     AND OLD.meeting_id IS NOT NULL AND NEW.meeting_id IS NULL
     AND (to_jsonb(NEW) - 'meeting_id' - 'edited_at') = (to_jsonb(OLD) - 'meeting_id' - 'edited_at') THEN
    RETURN NEW;
  END IF;

  -- The note body is the only user-editable field; preserve its original author, date,
  -- meeting, source, tenant, Rock and recorded status/progress snapshot.
  IF TG_OP = 'UPDATE'
     AND NEW.body IS DISTINCT FROM OLD.body
     AND (to_jsonb(NEW) - 'body' - 'edited_at') = (to_jsonb(OLD) - 'body' - 'edited_at') THEN
    NEW.edited_at := statement_timestamp();
    RETURN NEW;
  END IF;

  -- RLS decides which staff authors and Super Admins may delete the row.
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Only the note body can be edited';
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_eos_rock_notes_mutations() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_eos_rock_notes_crud_guard
  BEFORE UPDATE OR DELETE ON public.eos_rock_notes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_eos_rock_notes_mutations();

NOTIFY pgrst, 'reload schema';
