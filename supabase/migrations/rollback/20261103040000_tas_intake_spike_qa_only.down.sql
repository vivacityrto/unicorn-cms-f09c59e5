-- QA drop script for 20261103040000_tas_intake_spike_qa_only.sql (QA ONLY spike; never on production).
-- Removes every object the spike created. Safe to run more than once.

DROP FUNCTION IF EXISTS public.tas_submit(uuid, integer, uuid);
DROP FUNCTION IF EXISTS public.tas_save_answers(uuid, integer, jsonb);
DROP FUNCTION IF EXISTS public.tas_start_intake(bigint, text, text, jsonb);

DROP TABLE IF EXISTS public.tas_answer;
DROP TABLE IF EXISTS public.tas_intake_version;
DROP TABLE IF EXISTS public.tas_intake;

DROP FUNCTION IF EXISTS public.tas_answer_freeze();
DROP FUNCTION IF EXISTS public.tas_version_freeze();
DROP FUNCTION IF EXISTS public.tas_intake_check_stage_tenant();
DROP FUNCTION IF EXISTS public.tas_client_actor(bigint);
DROP FUNCTION IF EXISTS public.tas_staff();

NOTIFY pgrst, 'reload schema';
