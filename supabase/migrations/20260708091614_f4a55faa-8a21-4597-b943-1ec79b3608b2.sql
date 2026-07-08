CREATE OR REPLACE FUNCTION public.skip_bulk_document_job_items(
  p_job_id uuid,
  p_item_ids bigint[]
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_creator uuid;
  v_moved int := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_item_ids IS NULL OR array_length(p_item_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  SELECT created_by INTO v_creator FROM public.bulk_document_jobs WHERE id = p_job_id;
  IF v_creator IS NULL THEN
    RAISE EXCEPTION 'bulk_document_jobs % not found', p_job_id USING ERRCODE = '02000';
  END IF;

  IF v_caller <> v_creator AND NOT public.is_vivacity_internal_safe(v_caller) THEN
    RAISE EXCEPTION 'Only the creator or Vivacity staff may modify a job' USING ERRCODE = '42501';
  END IF;

  WITH moved AS (
    UPDATE public.bulk_document_job_items
       SET state = 'skipped',
           last_error_code = COALESCE(last_error_code, 'excluded_on_retry'),
           last_error = COALESCE(last_error, 'Excluded on retry by user'),
           finished_at = COALESCE(finished_at, now())
     WHERE job_id = p_job_id
       AND id = ANY(p_item_ids)
       AND state IN ('failed', 'cancelled')
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_moved FROM moved;

  IF v_moved > 0 THEN
    UPDATE public.bulk_document_jobs
       SET failed_count = GREATEST(0, failed_count - v_moved),
           skipped_count = skipped_count + v_moved
     WHERE id = p_job_id;
  END IF;

  RETURN v_moved;
END;
$function$;

REVOKE ALL ON FUNCTION public.skip_bulk_document_job_items(uuid, bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.skip_bulk_document_job_items(uuid, bigint[]) TO authenticated;