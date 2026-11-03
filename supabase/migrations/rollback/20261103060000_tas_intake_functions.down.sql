-- Rollback for 20261103060000_tas_intake_functions.sql. Drops every function it created; the tables
-- (20261103050000_tas_intake_tables.sql) are untouched. Safe to run more than once.

DROP FUNCTION IF EXISTS public.tas_staff_redact_answer(uuid, text, text);
DROP FUNCTION IF EXISTS public.tas_staff_return_for_edit(uuid, integer, text);
DROP FUNCTION IF EXISTS public.tas_staff_review_answer(uuid, text, text);
DROP FUNCTION IF EXISTS public.tas_client_submit(uuid, integer, uuid);
DROP FUNCTION IF EXISTS public.tas_staff_submit(uuid, integer, uuid);
DROP FUNCTION IF EXISTS public.tas_client_save_answers(uuid, integer, jsonb);
DROP FUNCTION IF EXISTS public.tas_staff_save_answers(uuid, integer, jsonb);
DROP FUNCTION IF EXISTS public.tas_start_intake(bigint, text, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.tas__submit(uuid, integer, uuid, text);
DROP FUNCTION IF EXISTS public.tas__save(uuid, integer, jsonb, text);
DROP FUNCTION IF EXISTS public.tas__authorise(uuid, text);
DROP FUNCTION IF EXISTS public.tas__audit(bigint, uuid, uuid, text, text, text, uuid, text, jsonb, jsonb);

NOTIFY pgrst, 'reload schema';
