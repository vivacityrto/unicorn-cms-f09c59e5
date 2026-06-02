DROP FUNCTION IF EXISTS public.launch_cohort_job(text,jsonb,int,int,int,text);

CREATE OR REPLACE FUNCTION public.launch_cohort_job(
  p_action        text,
  p_filter        jsonb,
  p_cap           int    DEFAULT 1000,
  p_batch_size    int    DEFAULT 10,
  p_throttle_ms   int    DEFAULT 400,
  p_notes         text   DEFAULT NULL,
  p_include_uuids uuid[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_job_id uuid;
  v_caller uuid := auth.uid();
  v_resolved int;
  v_planned  int;
BEGIN
  IF NOT public.is_vivacity_staff(v_caller) THEN
    RAISE EXCEPTION 'FORBIDDEN: Vivacity staff only';
  END IF;
  IF p_action NOT IN ('activate','reset') THEN
    RAISE EXCEPTION 'INVALID_ACTION: must be activate or reset';
  END IF;

  INSERT INTO public.cohort_send_jobs (
    created_by, action, filter_json, cap, batch_size, throttle_ms, notes, started_at, status
  ) VALUES (
    v_caller, p_action, COALESCE(p_filter,'{}'::jsonb),
    LEAST(GREATEST(COALESCE(p_cap,1000),1),1000),
    LEAST(GREATEST(COALESCE(p_batch_size,10),1),50),
    LEAST(GREATEST(COALESCE(p_throttle_ms,400),0),5000),
    p_notes, now(), 'running'
  )
  RETURNING id INTO v_job_id;

  WITH resolved AS (
    SELECT r.*
    FROM public.resolve_cohort(p_filter, LEAST(GREATEST(COALESCE(p_cap,1000),1),1000)) r
    WHERE p_include_uuids IS NULL OR r.user_uuid = ANY(p_include_uuids)
  ),
  ins AS (
    INSERT INTO public.cohort_send_job_items (
      job_id, user_uuid, tenant_id, email, state_snapshot, planned_action, skip_reason, outcome, reason, processed_at
    )
    SELECT
      v_job_id,
      r.user_uuid,
      r.tenant_id,
      r.email,
      r.account_state,
      CASE
        WHEN r.account_state = 'disabled' THEN 'skip'
        WHEN r.account_state = 'ghost'    AND p_action = 'activate' THEN 'activate'
        WHEN r.account_state = 'ghost'    AND p_action = 'reset'    THEN 'skip'
        WHEN r.account_state IN ('invited','active','dormant') AND p_action = 'reset' THEN 'reset'
        WHEN r.account_state IN ('invited','active','dormant') AND p_action = 'activate' THEN 'skip'
        ELSE 'skip'
      END AS planned_action,
      CASE
        WHEN r.account_state = 'disabled' THEN 'Account disabled — re-enable first'
        WHEN r.account_state = 'ghost' AND p_action = 'reset' THEN 'No auth account yet — use Activate'
        WHEN r.account_state IN ('invited','active','dormant') AND p_action = 'activate' THEN 'Already activated — use Send password reset'
        ELSE NULL
      END AS skip_reason,
      CASE WHEN r.account_state = 'disabled' THEN 'skipped'
           WHEN r.account_state = 'ghost'    AND p_action = 'reset'    THEN 'skipped'
           WHEN r.account_state IN ('invited','active','dormant') AND p_action = 'activate' THEN 'skipped'
           ELSE 'pending'
      END AS outcome,
      CASE
        WHEN r.account_state = 'disabled' THEN 'Account disabled — re-enable first'
        WHEN r.account_state = 'ghost' AND p_action = 'reset' THEN 'No auth account yet — use Activate'
        WHEN r.account_state IN ('invited','active','dormant') AND p_action = 'activate' THEN 'Already activated — use Send password reset'
        ELSE NULL
      END AS reason,
      CASE WHEN r.account_state = 'disabled'
            OR (r.account_state = 'ghost' AND p_action = 'reset')
            OR (r.account_state IN ('invited','active','dormant') AND p_action = 'activate')
           THEN now() ELSE NULL END AS processed_at
    FROM resolved r
    ON CONFLICT (job_id, user_uuid) DO NOTHING
    RETURNING outcome
  )
  SELECT count(*) FILTER (WHERE outcome = 'pending'),
         count(*)
  INTO v_planned, v_resolved
  FROM ins;

  UPDATE public.cohort_send_jobs
  SET total_resolved = v_resolved,
      total_planned  = v_planned,
      total_skipped  = v_resolved - v_planned
  WHERE id = v_job_id;

  INSERT INTO public.audit_eos_events (
    user_id, entity, entity_id, action, reason, details
  ) VALUES (
    v_caller, 'cohort_send_job', v_job_id, 'cohort_job_launched',
    'Cross-tenant cohort access sender launched',
    jsonb_build_object('action', p_action, 'resolved', v_resolved, 'planned', v_planned, 'filter', p_filter, 'include_uuids_count', COALESCE(array_length(p_include_uuids,1),0))
  );

  RETURN v_job_id;
END;
$$;

REVOKE ALL    ON FUNCTION public.launch_cohort_job(text,jsonb,int,int,int,text,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.launch_cohort_job(text,jsonb,int,int,int,text,uuid[]) TO authenticated;