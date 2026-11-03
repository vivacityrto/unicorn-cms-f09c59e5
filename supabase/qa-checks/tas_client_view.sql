-- TAS client confirm view checks. RUN ON unicorn-qa ONLY. One DO block that ends by raising an
-- exception carrying the results, so nothing is ever persisted. Look for the word BAD.
--
-- Covers 20261103070000_tas_client_view.sql: the release gate (a client sees and can act on nothing
-- until a consultant releases the intake), the released summary (no internal content), confirm and
-- flag, the submit rule, staff-preview refusal, and every persona that must be refused.
DO $$
DECLARE
  v_staff uuid; v_stage bigint; v_ta bigint; v_ca uuid; v_cb uuid;
  v_i uuid; v_rv int; v_n int; v_s jsonb; v_msg1 text; v_msg2 text; v_ghost uuid := gen_random_uuid(); v_a2 uuid;
  v_out text := '';
  q1 text := 'tas.product.code_title.v1'; q2 text := 'tas.cohort.typical_learners.v1'; q3 text := 'tas.delivery.modes.v1';
BEGIN
  SELECT user_uuid INTO v_staff FROM public.users WHERE is_vivacity_internal AND NOT disabled AND NOT archived LIMIT 1;
  SELECT si.id, pi.tenant_id, tu.user_id INTO v_stage, v_ta, v_ca
  FROM public.stage_instances si JOIN public.package_instances pi ON pi.id = si.packageinstance_id
  JOIN public.tenant_users tu ON tu.tenant_id = pi.tenant_id AND tu.access_scope = 'full'
  JOIN public.users u ON u.user_uuid = tu.user_id AND NOT u.disabled AND NOT u.archived AND NOT u.is_vivacity_internal
  WHERE public.tenant_is_writeable(pi.tenant_id) AND tu.role <> 'parent'
    AND NOT EXISTS (SELECT 1 FROM public.tenant_users x WHERE x.user_id = tu.user_id AND x.tenant_id <> pi.tenant_id) LIMIT 1;
  SELECT tu.user_id INTO v_cb FROM public.tenant_users tu
  JOIN public.users u ON u.user_uuid = tu.user_id AND NOT u.disabled AND NOT u.archived AND NOT u.is_vivacity_internal
  WHERE tu.access_scope = 'full' AND tu.tenant_id <> v_ta
    AND NOT EXISTS (SELECT 1 FROM public.tenant_users x WHERE x.user_id = tu.user_id AND x.tenant_id = v_ta) LIMIT 1;
  IF v_staff IS NULL OR v_stage IS NULL OR v_cb IS NULL THEN RAISE EXCEPTION 'SETUP: personas missing'; END IF;
  INSERT INTO public.tas_question (question_id, schema_version, prompt, answer_kind, phase)
  VALUES (q1, '1', '[placeholder q1]', 'text', 'starter'), (q2, '1', '[placeholder q2]', 'text', 'starter'), (q3, '1', '[placeholder q3]', 'multi', 'starter');

  -- Consultant starts and fills the intake -----------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  SET LOCAL ROLE authenticated;
  v_i := public.tas_start_intake(v_stage, 'BSB50120', '', '1', 'rto', 'r1');
  v_rv := public.tas_staff_save_answers(v_i, 1, jsonb_build_array(
    jsonb_build_object('question_id', q1, 'answer_state', 'answered', 'value', to_jsonb('BSB50120'::text), 'source_type', 'prefill_tga', 'source_checked_at', ''),
    jsonb_build_object('question_id', q2, 'answer_state', 'answered', 'value', to_jsonb('adult learners'::text), 'source_type', 'consultant_entered'),
    jsonb_build_object('question_id', q3, 'answer_state', 'answered', 'value', to_jsonb('classroom'::text), 'source_type', 'consultant_entered')));
  BEGIN PERFORM public.tas_client_get_summary(v_i); v_out := v_out || 'C0 staff on client summary ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'C0 staff on client summary refused ' || SQLSTATE || ' (preview read-only, want 42501); '; END;
  RESET ROLE;

  -- Before release: the client sees and can do nothing ---------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_ca, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_ca::text, true);
  SET LOCAL ROLE authenticated;
  v_out := v_out || 'R1a unreleased: client reads intake/version/answer=' ||
    (SELECT count(*) FROM public.tas_intake) || '/' || (SELECT count(*) FROM public.tas_intake_version) || '/' || (SELECT count(*) FROM public.tas_answer) || ' (want 0/0/0); ';
  BEGIN PERFORM public.tas_client_get_summary(v_i); v_out := v_out || 'R1b unreleased summary ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'R1b unreleased summary refused ' || SQLSTATE || ':' || SQLERRM || ' (want 22023:Not found); '; END;
  BEGIN PERFORM public.tas_client_confirm_answers(v_i, v_rv, '[]'::jsonb); v_out := v_out || 'R1c unreleased confirm ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'R1c unreleased confirm refused ' || SQLSTATE || '; '; END;
  BEGIN PERFORM public.tas_staff_release_to_client(v_i, v_rv); v_out := v_out || 'R2a client release ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'R2a client release refused ' || SQLSTATE || '; '; END;
  RESET ROLE;

  -- Release ------------------------------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.tas_staff_release_to_client(v_i, v_rv - 1); v_out := v_out || 'R2b stale release ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'R2b stale release refused ' || SQLSTATE || ' (want 40001); '; END;
  PERFORM public.tas_staff_release_to_client(v_i, v_rv);
  SELECT row_version INTO v_rv FROM public.tas_intake WHERE id = v_i;
  PERFORM public.tas_staff_release_to_client(v_i, v_rv);
  RESET ROLE;
  v_out := v_out || 'R2c released; second release is a no-op, release audit rows=' || (SELECT count(*) FROM public.tas_audit_event WHERE intake_id = v_i AND action = 'release') || ' (want 1); ';

  -- After release: who can see it ----------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_ca, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_ca::text, true);
  SET LOCAL ROLE authenticated;
  v_out := v_out || 'R3a released: client reads intake/version/answer=' ||
    (SELECT count(*) FROM public.tas_intake) || '/' || (SELECT count(*) FROM public.tas_intake_version) || '/' || (SELECT count(*) FROM public.tas_answer) || ' (want 1/1/3), review/audit/question=' ||
    (SELECT count(*) FROM public.tas_answer_review) || '/' || (SELECT count(*) FROM public.tas_audit_event) || '/' || (SELECT count(*) FROM public.tas_question) || ' (want 0/0/0); ';
  v_s := public.tas_client_get_summary(v_i);
  v_out := v_out || 'R3b summary keys=' || (SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(v_s) k) || ' (want answers,counts,intake,version); ';
  v_out := v_out || 'R3c answer keys=' || (SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys(v_s->'answers'->0) k) || '; ';
  v_out := v_out || 'R3d counts total/confirmed/flagged=' || (v_s->'counts'->>'total') || '/' || (v_s->'counts'->>'confirmed') || '/' || (v_s->'counts'->>'flagged') || ' (want 3/0/0); ';
  v_out := v_out || 'R3e summary carries placeholder prompts=' || (v_s::text LIKE '%[placeholder q1]%') || ' and no source_ref or reason=' || (v_s::text NOT LIKE '%source_ref%' AND v_s::text NOT LIKE '%reason%') || ' (want true/true); ';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cb, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_cb::text, true);
  SET LOCAL ROLE authenticated;
  v_out := v_out || 'R4a other-tenant client reads ' || (SELECT count(*) FROM public.tas_intake) || '/' || (SELECT count(*) FROM public.tas_answer) || ' (want 0/0); ';
  BEGIN PERFORM public.tas_client_get_summary(v_i); EXCEPTION WHEN OTHERS THEN v_msg1 := SQLSTATE || ':' || SQLERRM; END;
  BEGIN PERFORM public.tas_client_get_summary(v_ghost); EXCEPTION WHEN OTHERS THEN v_msg2 := SQLSTATE || ':' || SQLERRM; END;
  v_out := v_out || 'R4b other tenant and unknown intake give the same error=' || (v_msg1 = v_msg2 AND v_msg1 IS NOT NULL) || ' (want true); ';
  RESET ROLE;

  UPDATE public.users SET disabled = true WHERE user_uuid = v_ca;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_ca, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_ca::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.tas_client_get_summary(v_i); v_out := v_out || 'R4c disabled client ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'R4c disabled client refused ' || SQLSTATE || '; '; END;
  v_out := v_out || 'R4d disabled client reads ' || (SELECT count(*) FROM public.tas_intake) || ' (want 0); ';
  RESET ROLE;
  UPDATE public.users SET disabled = false WHERE user_uuid = v_ca;

  UPDATE public.tenant_users SET access_scope = 'academy_only' WHERE user_id = v_ca AND tenant_id = v_ta;
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.tas_client_get_summary(v_i); v_out := v_out || 'R4e academy-only client ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'R4e academy-only client refused ' || SQLSTATE || '; '; END;
  RESET ROLE;
  UPDATE public.tenant_users SET access_scope = 'full' WHERE user_id = v_ca AND tenant_id = v_ta;

  SET LOCAL ROLE anon;
  BEGIN PERFORM public.tas_client_get_summary(v_i); v_out := v_out || 'R4f anon ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'R4f anon refused ' || SQLSTATE || ' (want 42501); '; END;
  RESET ROLE;

  -- Confirm and flag -----------------------------------------------------------------------------------------
  SELECT row_version INTO v_rv FROM public.tas_intake WHERE id = v_i;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_ca, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_ca::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.tas_client_submit(v_i, v_rv, gen_random_uuid()); v_out := v_out || 'S1 submit with unconfirmed answers ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'S1 submit before confirming refused ' || SQLSTATE || ':' || SQLERRM || ' (want 22023); '; END;
  BEGIN PERFORM public.tas_client_confirm_answers(v_i, v_rv, jsonb_build_array(jsonb_build_object('question_id', q1, 'decision', 'approve'))); v_out := v_out || 'S2a bad decision ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'S2a bad decision refused ' || SQLSTATE || '; '; END;
  BEGIN PERFORM public.tas_client_confirm_answers(v_i, v_rv, jsonb_build_array(jsonb_build_object('question_id', 'tas.nope.nothing.v1', 'decision', 'confirm'))); v_out := v_out || 'S2b unknown question ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'S2b unknown question refused ' || SQLSTATE || '; '; END;
  BEGIN PERFORM public.tas_client_confirm_answers(v_i, v_rv - 1, '[]'::jsonb); v_out := v_out || 'S2c stale confirm ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'S2c stale confirm refused ' || SQLSTATE || ' (want 40001); '; END;
  v_rv := public.tas_client_confirm_answers(v_i, v_rv, jsonb_build_array(
    jsonb_build_object('question_id', q1, 'decision', 'confirm'), jsonb_build_object('question_id', q2, 'decision', 'confirm'), jsonb_build_object('question_id', q3, 'decision', 'flag')));
  v_s := public.tas_client_get_summary(v_i);
  v_out := v_out || 'S3 after confirming 2 and flagging 1: confirmed/flagged=' || (v_s->'counts'->>'confirmed') || '/' || (v_s->'counts'->>'flagged') || ' (want 2/1); ';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.tas_client_confirm_answers(v_i, v_rv, '[]'::jsonb); v_out := v_out || 'S4 staff confirm ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'S4 staff on client confirm refused ' || SQLSTATE || '; '; END;
  RESET ROLE;
  SELECT count(*) INTO v_n FROM public.tas_answer a JOIN public.tas_intake_version v ON v.id = a.version_id WHERE v.intake_id = v_i AND a.question_id = q3 AND a.answer_state = 'needs_advice' AND a.client_confirmed_at IS NULL AND a.value IS NOT NULL;
  v_out := v_out || 'S5 flagged answer keeps its value, needs advice, not confirmed=' || v_n || ' (want 1); ';
  SELECT count(*) INTO v_n FROM public.tas_audit_event WHERE intake_id = v_i AND action = 'confirm' AND after_state::text NOT LIKE '%BSB50120%';
  v_out := v_out || 'S6 confirm audit rows carry counts only=' || v_n || ' (want 1); ';

  -- Submit and what follows -------------------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_ca, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_ca::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.tas_client_submit(v_i, v_rv, gen_random_uuid());
  BEGIN PERFORM public.tas_client_confirm_answers(v_i, v_rv + 1, '[]'::jsonb); v_out := v_out || 'S7 confirm after submit ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'S7 confirm after submit refused ' || SQLSTATE || '; '; END;
  RESET ROLE;
  v_out := v_out || 'S8 status=' || (SELECT status FROM public.tas_intake WHERE id = v_i) || ' (want submitted); ';

  -- Return with an internal reason: the client never sees it ------------------------------------------------------
  SELECT a.id INTO v_a2 FROM public.tas_answer a JOIN public.tas_intake_version v ON v.id = a.version_id WHERE v.intake_id = v_i AND v.state = 'submitted' AND a.question_id = q2;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.tas_staff_review_answer(v_a2, 'return', 'internal-note-secret');
  SELECT row_version INTO v_rv FROM public.tas_intake WHERE id = v_i;
  PERFORM public.tas_staff_return_for_edit(v_i, v_rv, 'internal-note-secret');
  PERFORM public.tas_staff_redact_answer(v_i, q1, 'erasure request');
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_ca, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_ca::text, true);
  SET LOCAL ROLE authenticated;
  v_s := public.tas_client_get_summary(v_i);
  v_out := v_out || 'T1 after return: version=' || (v_s->'version'->>'version_no') || '/' || (v_s->'version'->>'state') || ' (want 2/draft); ';
  v_out := v_out || 'T2 summary never carries the internal reason=' || (v_s::text NOT LIKE '%internal-note-secret%') || ' (want true); ';
  v_out := v_out || 'T3 returned flag on the returned answer=' || (SELECT count(*) FROM jsonb_array_elements(v_s->'answers') e WHERE e->>'question_id' = q2 AND (e->>'returned')::boolean) || ' (want 1); ';
  v_out := v_out || 'T4 redacted answer comes back removed with no value=' || (SELECT count(*) FROM jsonb_array_elements(v_s->'answers') e WHERE e->>'question_id' = q1 AND (e->>'removed')::boolean AND e->'value' = 'null'::jsonb) || ' (want 1); ';
  SELECT row_version INTO v_rv FROM public.tas_intake WHERE id = v_i;
  BEGIN PERFORM public.tas_client_confirm_answers(v_i, v_rv, jsonb_build_array(jsonb_build_object('question_id', q1, 'decision', 'confirm'))); v_out := v_out || 'T5 confirm a removed answer ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'T5 confirm a removed answer refused ' || SQLSTATE || '; '; END;
  RESET ROLE;

  RAISE EXCEPTION 'ROLLED-BACK RESULTS: %', v_out;
END $$;
