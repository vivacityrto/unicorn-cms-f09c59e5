
CREATE OR REPLACE FUNCTION public.lease_cohort_job_items(p_job_id uuid, p_worker_id text, p_limit integer DEFAULT 10, p_caller_id uuid DEFAULT NULL)
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
    SELECT 1 FROM public.cohort_send_jobs
    WHERE id = p_job_id AND status = 'running'
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

CREATE OR REPLACE FUNCTION public.record_cohort_item_outcome(p_item_id bigint, p_outcome text, p_reason text DEFAULT NULL::text, p_caller_id uuid DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_job_id uuid;
BEGIN
  IF NOT public.is_vivacity_staff(COALESCE(p_caller_id, auth.uid())) THEN
    RAISE EXCEPTION 'FORBIDDEN: Vivacity staff only';
  END IF;
  IF p_outcome NOT IN ('sent','skipped','failed') THEN
    RAISE EXCEPTION 'INVALID_OUTCOME';
  END IF;

  UPDATE public.cohort_send_job_items
  SET outcome      = p_outcome,
      reason       = p_reason,
      processed_at = now(),
      locked_at    = NULL,
      locked_by    = NULL
  WHERE id = p_item_id AND outcome = 'pending'
  RETURNING job_id INTO v_job_id;

  IF v_job_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.cohort_send_jobs
  SET total_sent    = total_sent    + CASE WHEN p_outcome = 'sent'    THEN 1 ELSE 0 END,
      total_skipped = total_skipped + CASE WHEN p_outcome = 'skipped' THEN 1 ELSE 0 END,
      total_failed  = total_failed  + CASE WHEN p_outcome = 'failed'  THEN 1 ELSE 0 END,
      consecutive_failures = CASE WHEN p_outcome = 'failed' THEN consecutive_failures + 1 ELSE 0 END
  WHERE id = v_job_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalise_cohort_job(p_job_id uuid, p_caller_id uuid DEFAULT NULL)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_pending int;
  v_status  text;
  v_action  text;
  v_caller  uuid := COALESCE(p_caller_id, auth.uid());
BEGIN
  IF NOT public.is_vivacity_staff(v_caller) THEN
    RAISE EXCEPTION 'FORBIDDEN: Vivacity staff only';
  END IF;

  SELECT count(*) INTO v_pending
  FROM public.cohort_send_job_items
  WHERE job_id = p_job_id AND outcome = 'pending';

  SELECT status, action INTO v_status, v_action
  FROM public.cohort_send_jobs WHERE id = p_job_id;

  IF v_pending = 0 AND v_status = 'running' THEN
    UPDATE public.cohort_send_jobs
    SET status = 'completed', finished_at = now()
    WHERE id = p_job_id;

    INSERT INTO public.audit_eos_events (
      tenant_id, user_id, entity, entity_id, action, reason, details
    )
    SELECT 6372, v_caller, 'cohort_send_job', id, 'cohort_job_completed',
           'Cross-tenant cohort access sender completed',
           jsonb_build_object('action', v_action,
                              'sent', total_sent,
                              'skipped', total_skipped,
                              'failed', total_failed)
    FROM public.cohort_send_jobs WHERE id = p_job_id;

    RETURN 'completed';
  END IF;
  RETURN v_status;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_cohort_job_status(p_job_id uuid, p_status text, p_caller_id uuid DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  IF NOT public.is_vivacity_staff(COALESCE(p_caller_id, auth.uid())) THEN
    RAISE EXCEPTION 'FORBIDDEN: Vivacity staff only';
  END IF;
  IF p_status NOT IN ('running','paused','cancelled') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  UPDATE public.cohort_send_jobs
  SET status = p_status,
      finished_at = CASE WHEN p_status = 'cancelled' THEN now() ELSE finished_at END,
      consecutive_failures = CASE WHEN p_status = 'running' THEN 0 ELSE consecutive_failures END
  WHERE id = p_job_id
    AND status IN ('running','paused');
END;
$function$;
