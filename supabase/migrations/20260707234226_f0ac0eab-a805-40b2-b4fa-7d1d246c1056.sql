-- resume_bulk_document_job
-- Mirrors cancel_bulk_document_job gate exactly (creator OR is_vivacity_internal_safe).
-- Only permits status='stalled' -> 'running'. Records resumed_by/resumed_at in error_summary.
-- Does not re-lease items; the launcher's fire-and-forget worker invocation drives the chain.

CREATE OR REPLACE FUNCTION public.resume_bulk_document_job(p_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller  uuid := auth.uid();
  v_creator uuid;
  v_status  text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT created_by, status
    INTO v_creator, v_status
    FROM public.bulk_document_jobs
   WHERE id = p_job_id;

  IF v_creator IS NULL THEN
    RAISE EXCEPTION 'bulk_document_jobs % not found', p_job_id USING ERRCODE = '02000';
  END IF;

  IF v_caller <> v_creator AND NOT public.is_vivacity_internal_safe(v_caller) THEN
    RAISE EXCEPTION 'Only the creator or Vivacity staff may resume a job' USING ERRCODE = '42501';
  END IF;

  IF v_status <> 'stalled' THEN
    RAISE EXCEPTION 'resume only permitted on stalled jobs (current: %)', v_status
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.bulk_document_jobs
     SET status = 'running',
         error_summary = COALESCE(error_summary, '{}'::jsonb) || jsonb_build_object(
           'resumed_by',  v_caller,
           'resumed_at',  now()
         )
   WHERE id = p_job_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.resume_bulk_document_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resume_bulk_document_job(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';