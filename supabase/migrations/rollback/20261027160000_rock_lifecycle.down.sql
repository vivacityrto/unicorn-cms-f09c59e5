-- Rollback for 20261027160000_rock_lifecycle.sql. Drops the triggers, functions
-- and the history table. Rocks themselves are untouched; archived Rocks stay
-- archived (restore them first if needed).

DROP TRIGGER IF EXISTS trg_guard_eos_rock_delete ON public.eos_rocks;
DROP TRIGGER IF EXISTS trg_set_eos_rock_created_by ON public.eos_rocks;
DROP TRIGGER IF EXISTS trg_record_eos_rock_event ON public.eos_rocks;

DROP FUNCTION IF EXISTS public.restore_rock(uuid, boolean, boolean);
DROP FUNCTION IF EXISTS public.archive_rock(uuid, boolean);
DROP FUNCTION IF EXISTS public.rock_impact(uuid);
DROP FUNCTION IF EXISTS public.guard_eos_rock_delete();
DROP FUNCTION IF EXISTS public.rock_delete_blockers(uuid);
DROP FUNCTION IF EXISTS public.set_eos_rock_created_by();
DROP FUNCTION IF EXISTS public.record_eos_rock_event();

DROP TABLE IF EXISTS public.eos_rock_events;

NOTIFY pgrst, 'reload schema';
