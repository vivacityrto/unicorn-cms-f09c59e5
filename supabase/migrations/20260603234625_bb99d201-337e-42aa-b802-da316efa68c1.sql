DROP FUNCTION IF EXISTS public.set_cohort_job_status(uuid, text);
DROP FUNCTION IF EXISTS public.lease_cohort_job_items(uuid, text, integer);
DROP FUNCTION IF EXISTS public.record_cohort_item_outcome(bigint, text, text);
DROP FUNCTION IF EXISTS public.finalise_cohort_job(uuid);