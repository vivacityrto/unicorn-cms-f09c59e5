-- TAS intake: the client confirm view. A consultant starts and fills an intake, then RELEASES it to
-- the client, who reads it back and confirms or flags each answer before submitting.
--
--   * tas_intake.released_at: until a consultant releases an intake, a client can neither read it
--     (the SELECT policies now require it) nor act on it (the client functions answer "Not found",
--     the same as for an intake that does not exist).
--   * tas_staff_release_to_client: staff release an intake. Audited.
--   * tas_client_get_summary: the released summary and nothing else. It carries the question
--     wording, the answers and their confirm / flag state; it never carries consultant decisions,
--     reasons, notes, research or the audit trail. A redacted answer comes back as removed.
--   * tas_client_confirm_answers: the client confirms or flags answers on the draft version.
--   * tas_client_submit now refuses to submit while an applicable answer is neither confirmed nor
--     flagged.
-- Every client function refuses staff callers, so the staff preview stays read-only. Safe to apply
-- while the tables are empty. Rollback: rollback/20261103070000_tas_client_view.down.sql

ALTER TABLE public.tas_intake
  ADD COLUMN released_at timestamptz,
  ADD COLUMN released_by uuid;

-- Release checks used by the SELECT policies (security definer so the policies do not recurse).
CREATE OR REPLACE FUNCTION public.tas_intake_released(p_intake uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.tas_intake WHERE id = p_intake AND released_at IS NOT NULL);
$function$;

CREATE OR REPLACE FUNCTION public.tas_version_released(p_version uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.tas_intake_version v
    JOIN public.tas_intake i ON i.id = v.intake_id
    WHERE v.id = p_version AND i.released_at IS NOT NULL
  );
$function$;

REVOKE ALL ON FUNCTION public.tas_intake_released(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tas_version_released(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tas_intake_released(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tas_version_released(uuid) TO authenticated;

-- Clients read only released intakes.
DROP POLICY IF EXISTS tas_intake_select ON public.tas_intake;
CREATE POLICY tas_intake_select ON public.tas_intake FOR SELECT TO authenticated
  USING (public.tas_staff() OR (public.user_has_full_tenant_access(tenant_id) AND released_at IS NOT NULL));

DROP POLICY IF EXISTS tas_intake_version_select ON public.tas_intake_version;
CREATE POLICY tas_intake_version_select ON public.tas_intake_version FOR SELECT TO authenticated
  USING (public.tas_staff() OR (public.user_has_full_tenant_access(tenant_id) AND public.tas_intake_released(intake_id)));

DROP POLICY IF EXISTS tas_answer_select ON public.tas_answer;
CREATE POLICY tas_answer_select ON public.tas_answer FOR SELECT TO authenticated
  USING (public.tas_staff() OR (public.user_has_full_tenant_access(tenant_id) AND public.tas_version_released(version_id)));

-- A client reaches an intake only once it is released. An unreleased intake, an unknown intake and
-- another tenant's intake all give the same "Not found".
CREATE OR REPLACE FUNCTION public.tas__authorise(p_intake uuid, p_kind text)
RETURNS public.tas_intake
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tenant bigint;
  v_row public.tas_intake;
BEGIN
  IF p_kind = 'staff' THEN
    IF NOT public.tas_staff() THEN
      RAISE EXCEPTION 'Forbidden: staff only' USING ERRCODE = '42501';
    END IF;
  ELSIF public.tas_staff() THEN
    RAISE EXCEPTION 'Forbidden: staff cannot use client functions (the staff preview is read-only)' USING ERRCODE = '42501';
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.tas_intake WHERE id = p_intake;
  IF v_tenant IS NULL
     OR (p_kind = 'client' AND (NOT public.tas_client_actor(v_tenant) OR NOT public.tas_intake_released(p_intake))) THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.tas_intake WHERE id = p_intake FOR UPDATE;
  RETURN v_row;
END;
$function$;

-- Submit: as before, but a client cannot submit while an applicable answer is neither confirmed nor flagged.
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
       WHERE a.version_id = v_ver.id AND a.applicable AND a.answer_state <> 'unanswered'
         AND a.client_confirmed_at IS NULL AND a.answer_state <> 'needs_advice') THEN
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

-- Staff release an intake to the client.
CREATE OR REPLACE FUNCTION public.tas_staff_release_to_client(p_intake_id uuid, p_expected_row_version integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_i public.tas_intake;
BEGIN
  v_i := public.tas__authorise(p_intake_id, 'staff');
  IF v_i.status NOT IN ('in_progress', 'returned') THEN
    RAISE EXCEPTION 'Only an intake in progress or returned can be released' USING ERRCODE = '42501';
  END IF;
  IF v_i.row_version <> p_expected_row_version THEN
    RAISE EXCEPTION 'Someone else changed this intake; reload and try again' USING ERRCODE = '40001';
  END IF;
  IF v_i.released_at IS NOT NULL THEN
    RETURN;
  END IF;
  UPDATE public.tas_intake
     SET released_at = now(), released_by = auth.uid(), row_version = row_version + 1
   WHERE id = v_i.id;
  PERFORM public.tas__audit(v_i.tenant_id, v_i.id, NULL, 'staff', 'release', 'tas_intake', v_i.id, NULL, NULL, NULL);
END;
$function$;

-- The released summary: wording, answers and their confirm / flag state, and nothing internal.
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
           'confirmed', a.client_confirmed_at IS NOT NULL,
           'flagged', a.answer_state = 'needs_advice',
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

-- The client confirms or flags answers on the draft version. Decisions: [{question_id, decision: confirm|flag}].
CREATE OR REPLACE FUNCTION public.tas_client_confirm_answers(p_intake_id uuid, p_expected_row_version integer, p_decisions jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_i public.tas_intake;
  v_ver public.tas_intake_version;
  d jsonb;
  v_n_confirm integer := 0;
  v_n_flag integer := 0;
  v_answer public.tas_answer;
BEGIN
  v_i := public.tas__authorise(p_intake_id, 'client');
  IF v_i.status NOT IN ('in_progress', 'returned') THEN
    RAISE EXCEPTION 'The intake cannot be changed in its current state' USING ERRCODE = '42501';
  END IF;
  IF v_i.row_version <> p_expected_row_version THEN
    RAISE EXCEPTION 'Someone else changed this intake; reload and try again' USING ERRCODE = '40001';
  END IF;
  IF jsonb_typeof(p_decisions) <> 'array' THEN
    RAISE EXCEPTION 'decisions must be an array' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_ver FROM public.tas_intake_version
  WHERE intake_id = v_i.id AND state = 'draft' ORDER BY version_no DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The intake has no draft version' USING ERRCODE = '22023';
  END IF;

  FOR d IN SELECT e FROM jsonb_array_elements(p_decisions) e LOOP
    IF NOT (COALESCE(d->>'decision', '') = ANY (ARRAY['confirm', 'flag'])) THEN
      RAISE EXCEPTION 'decision must be confirm or flag' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_answer FROM public.tas_answer
    WHERE version_id = v_ver.id AND question_id = d->>'question_id' AND applicable;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unknown question' USING ERRCODE = '22023';
    END IF;
    IF v_answer.redacted_at IS NOT NULL THEN
      RAISE EXCEPTION 'A removed answer cannot be changed' USING ERRCODE = '42501';
    END IF;
    IF d->>'decision' = 'confirm' THEN
      UPDATE public.tas_answer
         SET client_confirmed_by = auth.uid(), client_confirmed_at = now(), review_state = 'client_reported',
             answer_state = CASE WHEN answer_state = 'needs_advice' THEN 'answered' ELSE answer_state END,
             row_version = row_version + 1
       WHERE id = v_answer.id;
      v_n_confirm := v_n_confirm + 1;
    ELSE
      UPDATE public.tas_answer
         SET client_confirmed_by = NULL, client_confirmed_at = NULL, review_state = 'client_reported',
             answer_state = 'needs_advice', row_version = row_version + 1
       WHERE id = v_answer.id;
      v_n_flag := v_n_flag + 1;
    END IF;
  END LOOP;

  UPDATE public.tas_intake SET row_version = row_version + 1 WHERE id = v_i.id;
  PERFORM public.tas__audit(v_i.tenant_id, v_i.id, v_ver.id, 'client', 'confirm', 'tas_intake_version', v_ver.id, NULL,
                            NULL, jsonb_build_object('confirmed', v_n_confirm, 'flagged', v_n_flag));
  RETURN v_i.row_version + 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.tas_staff_release_to_client(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tas_client_get_summary(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tas_client_confirm_answers(uuid, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tas_staff_release_to_client(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tas_client_get_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tas_client_confirm_answers(uuid, integer, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
