-- Rollback for 20261103050000_tas_intake_tables.sql.
-- Drops every object it created. The tables are append-only by design, so this is only safe
-- before any real intake exists; it will discard any rows that do. Safe to run more than once.

DROP TABLE IF EXISTS public.tas_audit_event;
DROP TABLE IF EXISTS public.tas_answer_review;
DROP TABLE IF EXISTS public.tas_answer;
DROP TABLE IF EXISTS public.tas_intake_version;
DROP TABLE IF EXISTS public.tas_intake;
DROP TABLE IF EXISTS public.tas_question;

DROP FUNCTION IF EXISTS public.tas_append_only();
DROP FUNCTION IF EXISTS public.tas_answer_guard();
DROP FUNCTION IF EXISTS public.tas_version_freeze();
DROP FUNCTION IF EXISTS public.tas_no_delete();
DROP FUNCTION IF EXISTS public.tas_intake_check_stage_tenant();
DROP FUNCTION IF EXISTS public.tas_client_actor(bigint);
DROP FUNCTION IF EXISTS public.tas_staff();

NOTIFY pgrst, 'reload schema';
