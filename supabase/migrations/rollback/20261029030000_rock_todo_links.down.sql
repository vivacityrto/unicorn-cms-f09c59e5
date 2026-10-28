-- Rollback for 20261029030000_rock_todo_links.sql.
-- Drops the functions, the trigger and the link table. The To-Dos themselves are NOT touched;
-- only their link to a Rock or milestone is lost (they become standalone).

DROP FUNCTION IF EXISTS public.unlink_todo_from_rock(uuid);
DROP FUNCTION IF EXISTS public.link_todo_to_rock(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.add_rock_todo(uuid, text, uuid, date, uuid, uuid);
DROP TRIGGER IF EXISTS trg_validate_eos_rock_todo_link ON public.eos_rock_todo_links;
DROP TABLE IF EXISTS public.eos_rock_todo_links;
DROP FUNCTION IF EXISTS public.validate_eos_rock_todo_link();

NOTIFY pgrst, 'reload schema';
