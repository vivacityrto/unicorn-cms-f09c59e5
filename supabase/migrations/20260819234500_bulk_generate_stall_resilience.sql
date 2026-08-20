-- Bulk-generate stall resilience + accurate diagnostics (2026-08-19, see audit
-- entry docs/audit-log/entries/2026-08-19-bulk-generate-stall-resilience.md).
--
-- Investigating job 85e00e30 stalling a SECOND time (after the earlier
-- EdgeRuntime.waitUntil fix, PR #378) surfaced two real bugs plus a genuine
-- reliability gap:
--
-- 1. reclaim_stale_bulk_document_locks's running->stalled transition never
--    wrote a reason into error_summary. Whatever `stalled_reason` was left
--    over from a PRIOR stall (or a manual stall_bulk_document_job call)
--    stays displayed indefinitely, misleadingly presented as current. Job
--    85e00e30 stalled a second time at ~09:10 UTC but the UI kept showing
--    the FIRST incident's reason from ~03:59 UTC.
--
-- 2. Both stall paths (worker's stallAndRelease -> stall_bulk_document_job,
--    and the watchdog above) only ever wrote ONE stalled_reason/stalled_at
--    pair, clobbered on every stall. There was no way to see that a job had
--    stalled more than once, or what each occurrence's reason was. Both now
--    also append to error_summary->'stall_history' (a jsonb array of
--    {reason, at, source}), additive, never cleared.
--
-- 3. The worker's self re-invoke chain has zero resilience to a rejected
--    re-invoke. Confirmed via function_logs: job 85e00e30's FIRST stall
--    (03:00 UTC, pre-fix) and its SECOND stall (07:06 UTC, post-fix) were
--    BOTH a 503 SUPABASE_EDGE_RUNTIME_SERVICE_DEGRADED on the self re-invoke
--    fetch -- a recurring transient condition on this Supabase project, not
--    a one-off. Today, any single occurrence permanently halts an 8,637-item
--    job until a human notices and clicks Retry. The only existing cron
--    (reclaim_stale_bulk_document_locks, every 5 min) merely detects and
--    flags staleness after 120 minutes; nothing resumes the chain.
--
--    Fix (this migration's part): list_idle_running_bulk_document_jobs, a
--    new read-only RPC returning 'running' jobs with pending/leased items
--    but no item activity in the last p_idle_minutes (default 3 -- well
--    above the worker's normal ~55-70s self-reinvoke cadence, so a healthy
--    chain never matches, but a dead one is caught within a couple of
--    minutes instead of 120). A new cron (bulk-generate-documents-resume-
--    stalled edge function, scheduled every 2 minutes below) calls this and
--    re-invokes the worker directly for each match. Paired with a worker-side
--    inline retry/backoff on a rejected self-reinvoke (separate code change,
--    same PR) for defense in depth: the inline retry handles a short blip
--    immediately; this cron backstop catches anything that still falls
--    through (e.g. the whole waitUntil-tracked continuation never running).

-- ── 1 & 2: accurate + accumulating stall reasons ───────────────────────────

CREATE OR REPLACE FUNCTION public.stall_bulk_document_job(p_job_id uuid, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_updated int;
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL
     AND NOT public.is_vivacity_team_safe((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  UPDATE public.bulk_document_jobs
     SET status = 'stalled',
         error_summary = COALESCE(error_summary, '{}'::jsonb)
           || jsonb_build_object(
                'stalled_reason', p_reason,
                'stalled_at', now(),
                'stall_history',
                COALESCE(error_summary -> 'stall_history', '[]'::jsonb)
                  || jsonb_build_array(jsonb_build_object(
                       'reason', p_reason,
                       'at', now(),
                       'source', 'worker'
                     ))
              )
   WHERE id = p_job_id AND status = 'running';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$function$;

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
    SET status = 'stalled',
        error_summary = COALESCE(j.error_summary, '{}'::jsonb)
          || jsonb_build_object(
               'stalled_reason',
               'watchdog_no_activity: no item activity for ' || p_stall_minutes
                 || '+ minutes with pending/leased items remaining',
               'stalled_at', now(),
               'stall_history',
               COALESCE(j.error_summary -> 'stall_history', '[]'::jsonb)
                 || jsonb_build_array(jsonb_build_object(
                      'reason',
                      'watchdog_no_activity: no item activity for ' || p_stall_minutes
                        || '+ minutes with pending/leased items remaining',
                      'at', now(),
                      'source', 'watchdog'
                    ))
             )
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

-- ── 3: resilience backstop — candidate detection ───────────────────────────

CREATE OR REPLACE FUNCTION public.list_idle_running_bulk_document_jobs(p_idle_minutes integer DEFAULT 3)
 RETURNS TABLE(job_id uuid)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT j.id
  FROM public.bulk_document_jobs j
  WHERE j.status = 'running'
    AND EXISTS (
      SELECT 1 FROM public.bulk_document_job_items i
      WHERE i.job_id = j.id AND i.state IN ('pending','leased')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.bulk_document_job_items i
      WHERE i.job_id = j.id AND i.state IN ('pending','leased')
        AND COALESCE(i.leased_at, i.updated_at, j.started_at)
            > now() - make_interval(mins => p_idle_minutes)
    );
$function$;

REVOKE ALL ON FUNCTION public.list_idle_running_bulk_document_jobs(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_idle_running_bulk_document_jobs(integer) TO service_role;

COMMENT ON FUNCTION public.list_idle_running_bulk_document_jobs(integer) IS
  'Resilience backstop for bulk-generate-documents-worker''s self-reinvoke chain. Returns running jobs with pending/leased items but no item activity in the last p_idle_minutes, so bulk-generate-documents-resume-stalled (cron, every 2 min) can re-invoke the worker directly instead of waiting for the 120-minute reclaim_stale_bulk_document_locks watchdog. Default 3 min is well above the worker''s normal ~55-70s self-reinvoke cadence.';

-- ── Cron: resilience backstop, every 2 minutes ─────────────────────────────

select cron.schedule(
  'bulk-generate-resume-stalled',
  '*/2 * * * *',
  $cron$
    select net.http_post(
      url := 'https://yxkgdalkbrriasiyyrwk.supabase.co/functions/v1/bulk-generate-documents-resume-stalled',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || private.cron_function_jwt(),
        'x-cron-invoke-secret', private.cron_invoke_secret()
      ),
      body := '{}'::jsonb
    ) as request_id;
  $cron$
);
