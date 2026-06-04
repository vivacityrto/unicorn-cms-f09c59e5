CREATE OR REPLACE FUNCTION public.lease_cohort_job_items(p_job_id uuid, p_worker_id text, p_limit integer DEFAULT 10, p_caller_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id bigint, user_uuid uuid, tenant_id bigint, email text, planned_action text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  IF NOT public.is_vivacity_staff(COALESCE(p_caller_id, auth.uid())) THEN
    RAISE EXCEPTION 'FORBIDDEN: Vivacity staff only';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.cohort_send_jobs csj
    WHERE csj.id = p_job_id AND csj.status = 'running'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.cohort_send_job_items it
  SET locked_at = now(),
      locked_by = p_worker_id,
      attempts  = it.attempts + 1
  WHERE it.id IN (
    SELECT i.id
    FROM public.cohort_send_job_items i
    WHERE i.job_id = p_job_id
      AND i.outcome = 'pending'
      AND (i.locked_at IS NULL OR i.locked_at < now() - interval '5 minutes')
    ORDER BY i.id
    LIMIT GREATEST(LEAST(COALESCE(p_limit,10),50),1)
    FOR UPDATE SKIP LOCKED
  )
  RETURNING it.id, it.user_uuid, it.tenant_id, it.email, it.planned_action;
END;
$function$;