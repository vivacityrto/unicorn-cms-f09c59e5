
ALTER TABLE public.bulk_document_job_items
  DROP CONSTRAINT bulk_document_job_items_state_check;

ALTER TABLE public.bulk_document_job_items
  ADD CONSTRAINT bulk_document_job_items_state_check
  CHECK (state = ANY (ARRAY['pending','leased','generated','skipped','failed','cancelled']));

CREATE OR REPLACE FUNCTION public.record_bulk_document_item_outcome(
  p_item_id bigint,
  p_worker_id text,
  p_state text,
  p_reason text DEFAULT NULL,
  p_outcome jsonb DEFAULT '{}'::jsonb,
  p_error text DEFAULT NULL,
  p_error_code text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_job_id uuid; v_updated int; v_exists boolean; v_remaining int;
BEGIN
  IF p_state NOT IN ('generated','skipped','failed') THEN
    RAISE EXCEPTION 'Invalid outcome state: %', p_state USING ERRCODE = '22023';
  END IF;
  IF p_worker_id IS NULL OR length(p_worker_id) = 0 THEN
    RAISE EXCEPTION 'p_worker_id is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.bulk_document_job_items i
  SET state = p_state,
      outcome = COALESCE(p_outcome,'{}'::jsonb) || jsonb_build_object('reason', p_reason),
      last_error = p_error,
      last_error_code = p_error_code,
      finished_at = now(),
      lease_expires_at = NULL
      -- worker_id intentionally retained as permanent audit record
  WHERE i.id = p_item_id AND i.state = 'leased' AND i.worker_id = p_worker_id
  RETURNING i.job_id INTO v_job_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    SELECT true INTO v_exists FROM public.bulk_document_job_items WHERE id = p_item_id;
    IF NOT COALESCE(v_exists, false) THEN
      RAISE EXCEPTION 'bulk_document_job_items % not found', p_item_id USING ERRCODE = '02000';
    END IF;
    RETURN false;
  END IF;

  UPDATE public.bulk_document_jobs j
  SET generated_count = j.generated_count + CASE WHEN p_state='generated' THEN 1 ELSE 0 END,
      skipped_count   = j.skipped_count   + CASE WHEN p_state='skipped'   THEN 1 ELSE 0 END,
      failed_count    = j.failed_count    + CASE WHEN p_state='failed'    THEN 1 ELSE 0 END,
      error_summary   = CASE
        WHEN p_state='failed' AND p_error_code IS NOT NULL
          THEN jsonb_set(j.error_summary, ARRAY[p_error_code],
                 to_jsonb(COALESCE((j.error_summary->>p_error_code)::int, 0) + 1), true)
        ELSE j.error_summary END
  WHERE j.id = v_job_id;

  SELECT COUNT(*) INTO v_remaining
  FROM public.bulk_document_job_items
  WHERE job_id = v_job_id AND state IN ('pending','leased');

  IF v_remaining = 0 THEN
    UPDATE public.bulk_document_jobs
    SET status = CASE WHEN status = 'cancelled' THEN 'cancelled' ELSE 'completed' END,
        finished_at = COALESCE(finished_at, now())
    WHERE id = v_job_id;
  END IF;

  RETURN true;
END;
$function$;
