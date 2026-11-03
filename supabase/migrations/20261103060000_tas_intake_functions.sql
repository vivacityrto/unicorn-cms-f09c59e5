-- TAS intake write functions. Every write to the tas_* tables goes through here; the tables have
-- SELECT-only grants (20261103050000_tas_intake_tables.sql).
--
-- Rules encoded (see the workstream plan):
--   * Client functions (tas_client_*) refuse staff callers, which is what keeps the staff
--     "preview as client" view read-only; staff functions (tas_staff_*) refuse everyone else.
--   * A client reaches only their own tenant's intake: an unknown intake and another tenant's
--     intake give the same "Not found", so existence is not revealed.
--   * Saves and submits take the intake's expected row_version: a stale one raises SQLSTATE 40001
--     and changes nothing. Submit is idempotent on its key and freezes the draft version with a
--     SHA-256 content hash.
--   * A submitted version is never edited: "return for edit" creates the next version by copying
--     the answers (previous_answer_id keeps the lineage). Redaction covers a question across every
--     version, so a copy cannot keep what an erasure request removed.
--   * Every change writes its tas_audit_event row in the same transaction. Audit rows record what
--     changed and who changed it, not the answer content.
-- Not here yet: the released client summary (the client confirm view) and a server-side check that
-- the starter questions are settled before submit.
-- Rollback: rollback/20261103060000_tas_intake_functions.down.sql

-- Internal helpers (callable only by the other functions here) ------------------------------------

CREATE OR REPLACE FUNCTION public.tas__audit(
  p_tenant bigint, p_intake uuid, p_version uuid, p_kind text, p_action text,
  p_target_type text, p_target uuid, p_reason text, p_before jsonb, p_after jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  INSERT INTO public.tas_audit_event (tenant_id, intake_id, version_id, actor_user_id, actor_kind, action,
                                      target_type, target_id, reason, before_state, after_state)
  VALUES (p_tenant, p_intake, p_version, auth.uid(), p_kind, p_action, p_target_type, p_target, p_reason,
          p_before, p_after);
$function$;

-- Resolve and authorise the caller for an intake, then lock it. p_kind is 'staff' or 'client'.
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
  IF v_tenant IS NULL OR (p_kind = 'client' AND NOT public.tas_client_actor(v_tenant)) THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.tas_intake WHERE id = p_intake FOR UPDATE;
  RETURN v_row;
END;
$function$;

-- Save answers on the draft version (shared by the client and staff wrappers).
CREATE OR REPLACE FUNCTION public.tas__save(p_intake uuid, p_expected integer, p_answers jsonb, p_kind text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_i public.tas_intake;
  v_ver public.tas_intake_version;
  a jsonb;
  v_src text;
  v_n integer := 0;
BEGIN
  v_i := public.tas__authorise(p_intake, p_kind);
  IF v_i.status NOT IN ('in_progress', 'returned') THEN
    RAISE EXCEPTION 'The intake cannot be edited in its current state' USING ERRCODE = '42501';
  END IF;
  IF v_i.row_version <> p_expected THEN
    RAISE EXCEPTION 'Someone else changed this intake; reload and try again' USING ERRCODE = '40001';
  END IF;
  IF jsonb_typeof(p_answers) <> 'array' THEN
    RAISE EXCEPTION 'answers must be an array' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_ver FROM public.tas_intake_version
  WHERE intake_id = v_i.id AND state = 'draft' ORDER BY version_no DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The intake has no draft version' USING ERRCODE = '22023';
  END IF;

  FOR a IN SELECT e FROM jsonb_array_elements(p_answers) e LOOP
    v_src := a->>'source_type';
    IF p_kind = 'client' AND NOT (COALESCE(v_src, '') = ANY (ARRAY['client_typed', 'client_button', 'client_voice_confirmed'])) THEN
      RAISE EXCEPTION 'A client answer must come from the client' USING ERRCODE = '42501';
    END IF;
    IF p_kind = 'staff' AND NOT (COALESCE(v_src, '') = ANY (ARRAY['consultant_entered', 'prefill_tenant_profile', 'prefill_tga', 'prefill_prior_version'])) THEN
      RAISE EXCEPTION 'A staff answer must be consultant-entered or a prefill' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.tas_question q
                   WHERE q.question_id = a->>'question_id' AND q.schema_version = v_i.schema_version) THEN
      RAISE EXCEPTION 'Unknown question' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.tas_answer (version_id, tenant_id, question_id, schema_version, answer_state, review_state,
                                   value, original_value, applicable, source_type, source_ref, source_checked_at,
                                   client_confirmed_by, client_confirmed_at)
    VALUES (v_ver.id, v_i.tenant_id, a->>'question_id', v_i.schema_version, COALESCE(a->>'answer_state', 'answered'),
            CASE WHEN p_kind = 'client' THEN 'client_reported' ELSE 'none' END,
            a->'value', a->'value', COALESCE((a->>'applicable')::boolean, true), v_src, a->>'source_ref',
            NULLIF(a->>'source_checked_at', '')::timestamptz,
            CASE WHEN p_kind = 'client' THEN auth.uid() END, CASE WHEN p_kind = 'client' THEN now() END)
    ON CONFLICT (version_id, question_id) DO UPDATE
      SET answer_state = EXCLUDED.answer_state,
          review_state = EXCLUDED.review_state,
          value = EXCLUDED.value,
          original_value = COALESCE(public.tas_answer.original_value, EXCLUDED.value),
          applicable = EXCLUDED.applicable,
          source_type = EXCLUDED.source_type,
          source_ref = EXCLUDED.source_ref,
          source_checked_at = EXCLUDED.source_checked_at,
          client_confirmed_by = EXCLUDED.client_confirmed_by,
          client_confirmed_at = EXCLUDED.client_confirmed_at,
          row_version = public.tas_answer.row_version + 1;
    v_n := v_n + 1;
  END LOOP;

  UPDATE public.tas_intake SET row_version = row_version + 1 WHERE id = v_i.id;
  PERFORM public.tas__audit(v_i.tenant_id, v_i.id, v_ver.id, p_kind, 'save', 'tas_intake_version', v_ver.id, NULL,
                            NULL, jsonb_build_object('answers_saved', v_n));
  RETURN v_i.row_version + 1;
END;
$function$;

-- Submit the draft version (shared by the client and staff wrappers). Idempotent on the key.
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

-- Public functions --------------------------------------------------------------------------------

-- Staff start an intake for a stage; the tenant is derived from the stage, never taken from the caller.
CREATE OR REPLACE FUNCTION public.tas_start_intake(
  p_stage_instance_id bigint,
  p_qualification_code text,
  p_cohort_label text,
  p_schema_version text,
  p_client_type text,
  p_ruleset_version text,
  p_prefill jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_tenant bigint;
  v_intake uuid;
  v_ver uuid;
BEGIN
  IF NOT public.tas_staff() THEN
    RAISE EXCEPTION 'Forbidden: staff only' USING ERRCODE = '42501';
  END IF;
  IF NOT (COALESCE(p_client_type, '') = ANY (ARRAY['rto', 'cricos'])) THEN
    RAISE EXCEPTION 'This client type is not supported by the TAS intake' USING ERRCODE = '22023';
  END IF;
  v_tenant := public.stage_instance_tenant_id(p_stage_instance_id);
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Stage not found' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.tas_intake (tenant_id, stage_instance_id, qualification_code, cohort_label, schema_version,
                                 client_type, ruleset_version, created_by)
  VALUES (v_tenant, p_stage_instance_id, btrim(p_qualification_code), COALESCE(p_cohort_label, ''),
          p_schema_version, p_client_type, p_ruleset_version, auth.uid())
  RETURNING id INTO v_intake;
  INSERT INTO public.tas_intake_version (intake_id, tenant_id, version_no, prefill_snapshot)
  VALUES (v_intake, v_tenant, 1, p_prefill) RETURNING id INTO v_ver;
  PERFORM public.tas__audit(v_tenant, v_intake, v_ver, 'staff', 'start', 'tas_intake', v_intake, NULL, NULL,
                            jsonb_build_object('client_type', p_client_type, 'schema_version', p_schema_version));
  RETURN v_intake;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tas_staff_save_answers(p_intake_id uuid, p_expected_row_version integer, p_answers jsonb)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.tas__save(p_intake_id, p_expected_row_version, p_answers, 'staff');
$function$;

CREATE OR REPLACE FUNCTION public.tas_client_save_answers(p_intake_id uuid, p_expected_row_version integer, p_answers jsonb)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.tas__save(p_intake_id, p_expected_row_version, p_answers, 'client');
$function$;

CREATE OR REPLACE FUNCTION public.tas_staff_submit(p_intake_id uuid, p_expected_row_version integer, p_idempotency_key uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.tas__submit(p_intake_id, p_expected_row_version, p_idempotency_key, 'staff');
$function$;

CREATE OR REPLACE FUNCTION public.tas_client_submit(p_intake_id uuid, p_expected_row_version integer, p_idempotency_key uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.tas__submit(p_intake_id, p_expected_row_version, p_idempotency_key, 'client');
$function$;

-- A consultant's decision on one submitted answer. Append-only; reason required.
CREATE OR REPLACE FUNCTION public.tas_staff_review_answer(p_answer_id uuid, p_decision text, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_a public.tas_answer;
  v_i public.tas_intake;
  v_review uuid;
BEGIN
  IF NOT public.tas_staff() THEN
    RAISE EXCEPTION 'Forbidden: staff only' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_a FROM public.tas_answer WHERE id = p_answer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE = '22023';
  END IF;
  SELECT i.* INTO v_i FROM public.tas_intake i
  JOIN public.tas_intake_version v ON v.intake_id = i.id AND v.id = v_a.version_id
  WHERE v.state = 'submitted' FOR UPDATE OF i;
  IF NOT FOUND OR v_i.status NOT IN ('submitted', 'in_review') THEN
    RAISE EXCEPTION 'Only a submitted answer of an intake under review can be reviewed' USING ERRCODE = '42501';
  END IF;
  IF NOT (COALESCE(p_decision, '') = ANY (ARRAY['accept', 'edit', 'return'])) THEN
    RAISE EXCEPTION 'decision must be accept, edit or return' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'A reason is required' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.tas_answer_review (answer_id, tenant_id, decision, reason, decided_by)
  VALUES (p_answer_id, v_a.tenant_id, p_decision, p_reason, auth.uid()) RETURNING id INTO v_review;
  IF v_i.status = 'submitted' THEN
    UPDATE public.tas_intake SET status = 'in_review', row_version = row_version + 1 WHERE id = v_i.id;
  END IF;
  PERFORM public.tas__audit(v_a.tenant_id, v_i.id, v_a.version_id, 'staff', 'review', 'tas_answer', p_answer_id,
                            p_reason, NULL, jsonb_build_object('decision', p_decision));
  RETURN v_review;
END;
$function$;

-- Return the intake to the client: create the next draft version by copying the latest submitted
-- version's answers, keeping the lineage in previous_answer_id. An answer the consultant returned
-- starts as 'returned'. The frozen version is untouched.
CREATE OR REPLACE FUNCTION public.tas_staff_return_for_edit(p_intake_id uuid, p_expected_row_version integer, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_i public.tas_intake;
  v_old public.tas_intake_version;
  v_new uuid;
BEGIN
  v_i := public.tas__authorise(p_intake_id, 'staff');
  IF v_i.status NOT IN ('submitted', 'in_review') THEN
    RAISE EXCEPTION 'Only a submitted intake can be returned' USING ERRCODE = '42501';
  END IF;
  IF v_i.row_version <> p_expected_row_version THEN
    RAISE EXCEPTION 'Someone else changed this intake; reload and try again' USING ERRCODE = '40001';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'A reason is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_old FROM public.tas_intake_version
  WHERE intake_id = v_i.id AND state = 'submitted' ORDER BY version_no DESC LIMIT 1;

  INSERT INTO public.tas_intake_version (intake_id, tenant_id, version_no, prefill_snapshot)
  VALUES (v_i.id, v_i.tenant_id, v_old.version_no + 1, v_old.prefill_snapshot) RETURNING id INTO v_new;

  INSERT INTO public.tas_answer (version_id, tenant_id, question_id, schema_version, answer_state, review_state,
                                 value, original_value, applicable, source_type, source_ref, source_checked_at,
                                 client_confirmed_by, client_confirmed_at, previous_answer_id, redacted_at, redacted_by)
  SELECT v_new, o.tenant_id, o.question_id, o.schema_version, o.answer_state,
         CASE WHEN last_review.decision = 'return' THEN 'returned' ELSE o.review_state END,
         o.value, o.original_value, o.applicable, o.source_type, o.source_ref, o.source_checked_at,
         o.client_confirmed_by, o.client_confirmed_at, o.id, o.redacted_at, o.redacted_by
  FROM public.tas_answer o
  LEFT JOIN LATERAL (
    SELECT r.decision FROM public.tas_answer_review r WHERE r.answer_id = o.id ORDER BY r.decided_at DESC LIMIT 1
  ) last_review ON true
  WHERE o.version_id = v_old.id;

  UPDATE public.tas_intake SET status = 'returned', row_version = row_version + 1 WHERE id = v_i.id;
  PERFORM public.tas__audit(v_i.tenant_id, v_i.id, v_new, 'staff', 'return', 'tas_intake', v_i.id, p_reason, NULL,
                            jsonb_build_object('new_version_no', v_old.version_no + 1));
  RETURN v_new;
END;
$function$;

-- Redact a question's answer on every version of an intake (erasure): the personal content is
-- replaced by a marker and the original cleared. The audit rows are written by the redaction guard.
CREATE OR REPLACE FUNCTION public.tas_staff_redact_answer(p_intake_id uuid, p_question_id text, p_reason text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_i public.tas_intake;
  v_n integer;
BEGIN
  v_i := public.tas__authorise(p_intake_id, 'staff');
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'A reason is required' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('tas.redaction_reason', p_reason, true);
  UPDATE public.tas_answer a
     SET value = '{"redacted": true}'::jsonb, original_value = NULL, redacted_at = now(), redacted_by = auth.uid()
   WHERE a.question_id = p_question_id AND a.redacted_at IS NULL
     AND a.version_id IN (SELECT id FROM public.tas_intake_version WHERE intake_id = v_i.id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM set_config('tas.redaction_reason', '', true);
  RETURN v_n;
END;
$function$;

-- Grants --------------------------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.tas__audit(bigint, uuid, uuid, text, text, text, uuid, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tas__authorise(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tas__save(uuid, integer, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tas__submit(uuid, integer, uuid, text) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.tas_start_intake(bigint, text, text, text, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tas_staff_save_answers(uuid, integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tas_client_save_answers(uuid, integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tas_staff_submit(uuid, integer, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tas_client_submit(uuid, integer, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tas_staff_review_answer(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tas_staff_return_for_edit(uuid, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tas_staff_redact_answer(uuid, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.tas_start_intake(bigint, text, text, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tas_staff_save_answers(uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tas_client_save_answers(uuid, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tas_staff_submit(uuid, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tas_client_submit(uuid, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tas_staff_review_answer(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tas_staff_return_for_edit(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tas_staff_redact_answer(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
