-- Rollback for 20261028020000_rock_blockers_and_carryover.sql.
-- Drops the blocker and carryover tables and functions, restores the previous
-- rock_delete_blockers() body, and removes the "Blocked" Rock status choice.
-- Destructive: recorded blockers and carryover provenance are lost. A Rock that
-- was left at status 'blocked' is moved to 'at_risk' first so no Rock keeps a
-- status the older screens do not know. Milestone status 'blocked' is part of
-- the earlier vocabulary and is left alone.

DROP TRIGGER IF EXISTS trg_require_open_blocker_rock ON public.eos_rocks;
DROP TRIGGER IF EXISTS trg_require_open_blocker_milestone ON public.eos_rock_milestones;
DROP TRIGGER IF EXISTS trg_resolve_blocker_on_rock_status ON public.eos_rocks;
DROP TRIGGER IF EXISTS trg_resolve_blocker_on_milestone_status ON public.eos_rock_milestones;

UPDATE public.eos_rocks SET status = 'at_risk' WHERE status = 'blocked';

DROP FUNCTION IF EXISTS public.carry_forward_rock(uuid, jsonb, jsonb, text);
DROP FUNCTION IF EXISTS public.resolve_blocker(text, uuid, text, text);
DROP FUNCTION IF EXISTS public.set_blocker(text, uuid, jsonb);
DROP FUNCTION IF EXISTS public.require_open_blocker();
DROP FUNCTION IF EXISTS public.resolve_blocker_on_status_change();

DROP TABLE IF EXISTS public.eos_rock_carryover_milestones;
DROP TABLE IF EXISTS public.eos_rock_carryovers;
DROP TABLE IF EXISTS public.eos_rock_blockers;

DROP FUNCTION IF EXISTS public.validate_eos_rock_carryover_milestone();
DROP FUNCTION IF EXISTS public.validate_eos_rock_carryover();
DROP FUNCTION IF EXISTS public.validate_eos_rock_blocker();

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
      THEN 'outcomes' END
  ]::text[], NULL);
$function$;

REVOKE ALL ON FUNCTION public.rock_delete_blockers(uuid) FROM PUBLIC, anon, authenticated;

DELETE FROM public.dd_rock_status WHERE value = 'blocked';

NOTIFY pgrst, 'reload schema';
