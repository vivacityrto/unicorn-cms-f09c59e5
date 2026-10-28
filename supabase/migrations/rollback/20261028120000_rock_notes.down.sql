-- Rollback for 20261028120000_rock_notes.sql.
-- Restores the previous rock_delete_blockers() body and drops the notes and summary tables.
-- Destructive: every recorded Rock note and AI summary is lost. Notes are meant to be a
-- permanent record, so use this only if the migration itself must be reverted.

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
      THEN 'carryover' END
  ]::text[], NULL);
$function$;

REVOKE ALL ON FUNCTION public.rock_delete_blockers(uuid) FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_eos_rock_notes_append_only ON public.eos_rock_notes;
DROP FUNCTION IF EXISTS public.add_rock_note(uuid, text, uuid, text);
DROP TABLE IF EXISTS public.eos_rock_note_summaries;
DROP TABLE IF EXISTS public.eos_rock_notes;
DROP FUNCTION IF EXISTS public.enforce_eos_rock_notes_append_only();

NOTIFY pgrst, 'reload schema';
