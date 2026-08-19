-- Two real bugs found investigating job 85e00e30 (2026-08-19, see audit entry
-- docs/audit-log/entries/2026-08-19-reclaim-stale-locks-counter-and-completion-fix.md):
--
-- 1. reclaim_stale_bulk_document_locks finalizes an item as 'failed' with a
--    raw UPDATE on bulk_document_job_items, but never touches
--    bulk_document_jobs.failed_count/error_summary -- those only get bumped
--    by record_bulk_document_item_outcome, which this function never calls.
--    Result: the job's own summary stats (and the UI's top-level "Failed"
--    stat tile) silently undercount -- confirmed live: job 85e00e30 had 25
--    real 'failed' items in bulk_document_job_items but failed_count = 0.
--
-- 2. Nothing ever marks a job 'completed' when its LAST remaining
--    pending/leased item is finalized by *this* function rather than by
--    record_bulk_document_item_outcome (the only other place that runs a
--    completion check). Such a job would stay 'running' forever with zero
--    pending/leased items left -- the existing "stalled" check below only
--    fires when pending/leased items still EXIST but are stale, not when
--    there are none left at all.
--
-- Statement 1 (reset + bump_counters) is safe to chain in one WITH: the
-- counter bump only reads job_counts/reset's own RETURNING rows, never
-- re-scans bulk_document_job_items, so it isn't subject to the same-snapshot
-- limitation that (correctly) keeps the completion check as its own
-- subsequent statement -- that one DOES need a fresh scan of
-- bulk_document_job_items reflecting the state changes statement 1 just made.

CREATE OR REPLACE FUNCTION public.reclaim_stale_bulk_document_locks(p_max_attempts integer DEFAULT 5, p_stall_minutes integer DEFAULT 120)
 RETURNS TABLE(reclaimed_items integer, stalled_jobs integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_reclaimed int := 0; v_stalled int := 0;
BEGIN
  WITH reset AS (
    UPDATE public.bulk_document_job_items i
    SET state = CASE WHEN i.attempt_count >= p_max_attempts THEN 'failed' ELSE 'pending' END,
        leased_at = NULL, lease_expires_at = NULL, worker_id = NULL,
        last_error = CASE WHEN i.attempt_count >= p_max_attempts
                          THEN 'lease expired; max attempts reached' ELSE i.last_error END,
        last_error_code = CASE WHEN i.attempt_count >= p_max_attempts
                               THEN 'LEASE_EXPIRED_MAX_ATTEMPTS' ELSE i.last_error_code END,
        finished_at = CASE WHEN i.attempt_count >= p_max_attempts THEN now() ELSE i.finished_at END
    WHERE i.state = 'leased'
      AND i.lease_expires_at IS NOT NULL
      AND i.lease_expires_at < now()
    RETURNING i.job_id, (i.attempt_count >= p_max_attempts) AS newly_failed
  ),
  job_counts AS (
    SELECT job_id, count(*) AS failed_n
    FROM reset
    WHERE newly_failed
    GROUP BY job_id
  ),
  bump_counters AS (
    UPDATE public.bulk_document_jobs j
    SET failed_count = j.failed_count + job_counts.failed_n,
        error_summary = jsonb_set(
          COALESCE(j.error_summary, '{}'::jsonb),
          ARRAY['LEASE_EXPIRED_MAX_ATTEMPTS'],
          to_jsonb(COALESCE((j.error_summary ->> 'LEASE_EXPIRED_MAX_ATTEMPTS')::int, 0) + job_counts.failed_n)
        )
    FROM job_counts
    WHERE j.id = job_counts.job_id
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_reclaimed FROM reset;

  -- A job whose last remaining pending/leased item was just finalized above
  -- (rather than via record_bulk_document_item_outcome) would otherwise
  -- never transition out of 'running'. Same completion rule as that function.
  UPDATE public.bulk_document_jobs j
  SET status = CASE WHEN j.status = 'cancelled' THEN 'cancelled' ELSE 'completed' END,
      finished_at = COALESCE(j.finished_at, now())
  WHERE j.status = 'running'
    AND NOT EXISTS (
      SELECT 1 FROM public.bulk_document_job_items i
      WHERE i.job_id = j.id AND i.state IN ('pending', 'leased')
    );

  WITH stalled AS (
    UPDATE public.bulk_document_jobs j
    SET status = 'stalled'
    WHERE j.status = 'running'
      AND NOT EXISTS (
        SELECT 1 FROM public.bulk_document_job_items i
        WHERE i.job_id = j.id AND i.state IN ('pending','leased')
          AND COALESCE(i.leased_at, i.updated_at, j.started_at)
              > now() - make_interval(mins => p_stall_minutes)
      )
      AND EXISTS (
        SELECT 1 FROM public.bulk_document_job_items i
        WHERE i.job_id = j.id AND i.state IN ('pending','leased')
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_stalled FROM stalled;

  reclaimed_items := v_reclaimed; stalled_jobs := v_stalled;
  RETURN NEXT;
END;
$function$;
