## Migration: retry + stall RPCs for bulk-generate jobs

Applying the two SECURITY DEFINER functions exactly as specified. Reviewed against the pinned design notes and the live schema — no bugs found, applying verbatim.

### Review findings (nothing changed from spec)

- **Eligibility set (`failed | cancelled | expired-leased`)**: correct given cancellation is job-level only. Confirmed `cancel_bulk_document_job` only stamps then-pending items; cancelled items never contributed to `error_summary` per-code buckets, so no decrement logic for them is required. ✓
- **`attempt_count` preserved**: `UPDATE ... SET state='pending', worker_id=NULL, ...` — `attempt_count` is deliberately absent from the SET list. Poison-item circuit breaker (`reclaim_stale_bulk_document_locks p_max_attempts=5`) continues to work. ✓
- **Decrement scope**: `WHERE state='failed' AND last_error_code IS NOT NULL` — matches the exclusive population that `record_bulk_document_item_outcome` writes into `error_summary`. ✓
- **`v_error_summary` NULL-safety**: initial `SELECT` may load NULL. The `-` and `jsonb_set` ops in the loop are only reached when `v_dec` has keys, which requires failed rows with error codes, which requires those buckets to exist — but even so the trailing `COALESCE(v_error_summary, '{}'::jsonb) || jsonb_build_object(...)` guarantees the final write is non-null. ✓
- **Auth gate**: `v_caller = v_creator OR is_vivacity_internal_safe(v_caller)` — matches `resume_bulk_document_job` convention. ✓
- **Status guard**: rejects only `'queued'`; allows `running/stalled/failed/completed/cancelled`. Zero-eligibility raises unless `status='stalled'` (D6). ✓
- **`stall_bulk_document_job` fencing**: `WHERE id=p_job_id AND status='running'` prevents clobbering a concurrent cancel. No auth.uid() gate by design (invoked by worker under service_role). Grants include `service_role` accordingly. ✓
- **Grants**: `REVOKE ALL ... FROM PUBLIC` then explicit grants — `retry` to `authenticated`, `stall` to `authenticated, service_role`. ✓
- **`NOTIFY pgrst, 'reload schema'`**: included at end of each function block per platform invariant. ✓

### SQL to apply (single migration transaction)

```sql
CREATE OR REPLACE FUNCTION public.retry_bulk_document_job(p_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_creator uuid;
  v_status text;
  v_failed_reset int;
  v_cancelled_reset int;
  v_leased_reset int;
  v_eligible int;
  v_dec jsonb;
  v_error_summary jsonb;
  k text;
  v text;
  cur int;
  newv int;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT created_by, status, error_summary INTO v_creator, v_status, v_error_summary
  FROM public.bulk_document_jobs WHERE id = p_job_id;

  IF v_creator IS NULL THEN
    RAISE EXCEPTION 'bulk_document_jobs % not found', p_job_id USING ERRCODE = '02000';
  END IF;

  IF v_caller <> v_creator AND NOT public.is_vivacity_internal_safe(v_caller) THEN
    RAISE EXCEPTION 'Only the creator or Vivacity staff may retry a job' USING ERRCODE = '42501';
  END IF;

  IF v_status = 'queued' THEN
    RAISE EXCEPTION 'job has not started; nothing to retry' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) FILTER (WHERE state = 'failed'),
         count(*) FILTER (WHERE state = 'cancelled'),
         count(*) FILTER (WHERE state = 'leased' AND lease_expires_at < now())
    INTO v_failed_reset, v_cancelled_reset, v_leased_reset
    FROM public.bulk_document_job_items
   WHERE job_id = p_job_id;

  v_eligible := v_failed_reset + v_cancelled_reset + v_leased_reset;

  IF v_eligible = 0 AND v_status <> 'stalled' THEN
    RAISE EXCEPTION 'nothing to retry on this job' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_object_agg(last_error_code, cnt), '{}'::jsonb)
    INTO v_dec
    FROM (
      SELECT last_error_code, count(*) AS cnt
        FROM public.bulk_document_job_items
       WHERE job_id = p_job_id AND state = 'failed' AND last_error_code IS NOT NULL
       GROUP BY last_error_code
    ) x;

  UPDATE public.bulk_document_job_items
     SET state = 'pending',
         worker_id = NULL,
         leased_at = NULL,
         lease_expires_at = NULL,
         started_at = NULL,
         finished_at = NULL,
         last_error = NULL,
         last_error_code = NULL
   WHERE job_id = p_job_id
     AND (state = 'failed' OR state = 'cancelled' OR (state = 'leased' AND lease_expires_at < now()));

  FOR k, v IN SELECT * FROM jsonb_each_text(v_dec) LOOP
    cur := COALESCE((v_error_summary ->> k)::int, 0);
    newv := GREATEST(0, cur - v::int);
    IF newv = 0 THEN
      v_error_summary := v_error_summary - k;
    ELSE
      v_error_summary := jsonb_set(v_error_summary, ARRAY[k], to_jsonb(newv));
    END IF;
  END LOOP;

  v_error_summary := COALESCE(v_error_summary, '{}'::jsonb) || jsonb_build_object(
    'retried_by', v_caller,
    'retried_at', now(),
    'retried_failed', v_failed_reset,
    'retried_cancelled', v_cancelled_reset,
    'retried_leased', v_leased_reset
  );

  UPDATE public.bulk_document_jobs
     SET status = 'running',
         failed_count = GREATEST(0, failed_count - v_failed_reset),
         finished_at = NULL,
         error_summary = v_error_summary
   WHERE id = p_job_id;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.retry_bulk_document_job(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.retry_bulk_document_job(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.stall_bulk_document_job(p_job_id uuid, p_reason text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_updated int;
BEGIN
  UPDATE public.bulk_document_jobs
     SET status = 'stalled',
         error_summary = COALESCE(error_summary, '{}'::jsonb) || jsonb_build_object(
           'stalled_reason', p_reason,
           'stalled_at', now()
         )
   WHERE id = p_job_id AND status = 'running';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$function$;

REVOKE ALL ON FUNCTION public.stall_bulk_document_job(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stall_bulk_document_job(uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
```

### Post-apply verification (I will run these)

```sql
SELECT proname, prosecdef, proconfig
FROM pg_proc
WHERE proname IN ('retry_bulk_document_job','stall_bulk_document_job');

SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_name IN ('retry_bulk_document_job','stall_bulk_document_job');
```

Expected: `prosecdef=true`, `proconfig` contains `search_path=`. Grants: `retry` → `authenticated` only; `stall` → `authenticated` + `service_role`; no `PUBLIC` rows.

### Scope

- No schema/column changes.
- No data backfill.
- No RLS/policy/FK changes.
- No launcher/worker/frontend changes (deferred to next phase).
