-- TAS client view: two review fixes on top of 20261103070000_tas_client_view.sql (already applied).
--   1. A removed (redacted) answer that the client never confirmed no longer blocks submission; the
--      page already leaves removed answers out of its checklist and the client cannot confirm one.
--   2. A returned answer must be looked at again. The copy made on return keeps the earlier confirmation,
--      so a returned answer now counts as neither confirmed nor flagged until the client decides again,
--      both in the summary and in the submit check.
-- Only function bodies change; no signatures, grants, policies or data. Rollback:
-- rollback/20261103080000_tas_client_view_fixes.down.sql

CREATE OR REPLACE FUNCTION public.tas__submit(p_intake uuid, p_expected integer, p_key uuid, p_kind text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_i public.tas_intake;
  v_ver public.tas_intake_version;
  v_hash text;
BEGIN
  v_i := public.tas__authorise(p_intake, p_kind);
  SELECT * INTO v_ver FROM public.tas_intake_version WHERE intake_id = v_i.id AND idempotency_key = p_key;
  IF FOUND THEN
    RETURN v_ver.id;
  END IF;
  IF v_i.status NOT IN ('in_progress', 'returned') THEN
    RAISE EXCEPTION 'The intake cannot be submitted in its current state' USING ERRCODE = '42501';
  END IF;
  IF v_i.row_version <> p_expected THEN
    RAISE EXCEPTION 'Someone else changed this intake; reload and try again' USING ERRCODE = '40001';
  END IF;
  SELECT * INTO v_ver FROM public.tas_intake_version
  WHERE intake_id = v_i.id AND state = 'draft' ORDER BY version_no DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The intake has no draft version' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'client' AND EXISTS (
       SELECT 1 FROM public.tas_answer a
       WHERE a.version_id = v_ver.id AND a.applicable AND a.redacted_at IS NULL AND a.answer_state <> 'unanswered'
         AND (a.review_state = 'returned'
              OR (a.client_confirmed_at IS NULL AND a.answer_state <> 'needs_advice'))) THEN
    RAISE EXCEPTION 'Confirm or flag every answer before submitting' USING ERRCODE = '22023';
  END IF;

  SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.question_id)::text, '[]'), 'UTF8')), 'hex')
    INTO v_hash
  FROM (SELECT question_id, answer_state, value, applicable, source_type, source_ref, source_checked_at
        FROM public.tas_answer WHERE version_id = v_ver.id) x;

  UPDATE public.tas_intake_version
     SET state = 'submitted', submitted_by = auth.uid(), submitted_at = now(), content_hash = v_hash,
         idempotency_key = p_key
   WHERE id = v_ver.id;
  UPDATE public.tas_intake SET status = 'submitted', row_version = row_version + 1 WHERE id = v_i.id;
  PERFORM public.tas__audit(v_i.tenant_id, v_i.id, v_ver.id, p_kind, 'submit', 'tas_intake_version', v_ver.id, NULL,
                            NULL, jsonb_build_object('version_no', v_ver.version_no, 'content_hash', v_hash));
  RETURN v_ver.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tas_client_get_summary(p_intake_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tenant bigint;
  v_i public.tas_intake;
  v_ver public.tas_intake_version;
  v_answers jsonb;
BEGIN
  IF public.tas_staff() THEN
    RAISE EXCEPTION 'Forbidden: staff cannot use client functions (the staff preview is read-only)' USING ERRCODE = '42501';
  END IF;
  SELECT tenant_id INTO v_tenant FROM public.tas_intake WHERE id = p_intake_id;
  IF v_tenant IS NULL OR NOT public.tas_client_actor(v_tenant) OR NOT public.tas_intake_released(p_intake_id) THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_i FROM public.tas_intake WHERE id = p_intake_id;
  SELECT * INTO v_ver FROM public.tas_intake_version WHERE intake_id = p_intake_id ORDER BY version_no DESC LIMIT 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'question_id', a.question_id,
           'prompt', q.prompt,
           'answer_kind', q.answer_kind,
           'answer_state', a.answer_state,
           'value', CASE WHEN a.redacted_at IS NULL THEN a.value ELSE NULL END,
           'removed', a.redacted_at IS NOT NULL,
           'source', CASE WHEN a.source_type LIKE 'prefill%' THEN 'prefill'
                          WHEN a.source_type = 'consultant_entered' THEN 'consultant' ELSE 'client' END,
           'source_checked_at', a.source_checked_at,
           'confirmed', a.client_confirmed_at IS NOT NULL AND a.review_state <> 'returned',
           'flagged', a.answer_state = 'needs_advice' AND a.review_state <> 'returned',
           'returned', a.review_state = 'returned'
         ) ORDER BY a.question_id), '[]'::jsonb)
    INTO v_answers
  FROM public.tas_answer a
  JOIN public.tas_question q ON q.question_id = a.question_id AND q.schema_version = a.schema_version
  WHERE a.version_id = v_ver.id AND a.applicable;

  RETURN jsonb_build_object(
    'intake', jsonb_build_object('id', v_i.id, 'status', v_i.status, 'row_version', v_i.row_version,
                                 'qualification_code', v_i.qualification_code, 'cohort_label', v_i.cohort_label),
    'version', jsonb_build_object('version_no', v_ver.version_no, 'state', v_ver.state),
    'answers', v_answers,
    'counts', jsonb_build_object(
      'total', jsonb_array_length(v_answers),
      'confirmed', (SELECT count(*) FROM jsonb_array_elements(v_answers) e WHERE (e->>'confirmed')::boolean),
      'flagged', (SELECT count(*) FROM jsonb_array_elements(v_answers) e WHERE (e->>'flagged')::boolean))
  );
END;
$function$;

NOTIFY pgrst, 'reload schema';
