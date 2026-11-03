-- TAS intake write-function checks. RUN ON unicorn-qa ONLY. One DO block that ends by raising an
-- exception carrying the results, so nothing is ever persisted. Look for the word BAD.
--
-- Covers 20261103060000_tas_intake_functions.sql: who may call what, no existence leak, stale
-- saves, idempotent submit with a SHA-256 hash, the freeze, review, return-for-edit (copy-on-return),
-- redaction across versions, and the audit trail (which must not carry answer content).
DO $$
DECLARE
  v_staff uuid; v_stage bigint; v_ta bigint; v_ca uuid; v_cb uuid;
  v_i uuid; v_i2 uuid; v_ver1 uuid; v_ver2 uuid; v_s1 uuid; v_s2 uuid; v_s3 uuid; v_ghost uuid := gen_random_uuid();
  v_a1 uuid; v_a2 uuid; v_rv int; v_n int; v_hash1 text; v_hash2 text; v_msg1 text; v_msg2 text;
  v_out text := '';
  k1 uuid := gen_random_uuid(); k2 uuid := gen_random_uuid(); k3 uuid := gen_random_uuid();
  q1 text := 'tas.product.code_title.v1'; q2 text := 'tas.cohort.typical_learners.v1'; q3 text := 'tas.delivery.modes.v1';
BEGIN
  SELECT user_uuid INTO v_staff FROM public.users WHERE is_vivacity_internal AND NOT disabled AND NOT archived LIMIT 1;
  SELECT si.id, pi.tenant_id, tu.user_id INTO v_stage, v_ta, v_ca
  FROM public.stage_instances si JOIN public.package_instances pi ON pi.id = si.packageinstance_id
  JOIN public.tenant_users tu ON tu.tenant_id = pi.tenant_id AND tu.access_scope = 'full'
  JOIN public.users u ON u.user_uuid = tu.user_id AND NOT u.disabled AND NOT u.archived AND NOT u.is_vivacity_internal
  WHERE public.tenant_is_writeable(pi.tenant_id) AND tu.role <> 'parent' LIMIT 1;
  SELECT tu.user_id INTO v_cb
  FROM public.tenant_users tu JOIN public.users u ON u.user_uuid = tu.user_id AND NOT u.disabled AND NOT u.archived AND NOT u.is_vivacity_internal
  WHERE tu.access_scope = 'full' AND tu.tenant_id <> v_ta LIMIT 1;
  IF v_staff IS NULL OR v_stage IS NULL OR v_cb IS NULL THEN RAISE EXCEPTION 'SETUP: personas missing'; END IF;
  INSERT INTO public.tas_question (question_id, schema_version, prompt, answer_kind, phase)
  VALUES (q1, '1', '[placeholder]', 'text', 'starter'), (q2, '1', '[placeholder]', 'text', 'starter'), (q3, '1', '[placeholder]', 'multi', 'starter');

  -- STAFF starts the intake ----------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  SET LOCAL ROLE authenticated;
  v_i := public.tas_start_intake(v_stage, 'BSB50120', '', '1', 'rto', 'r1', '{"source":"tga"}'::jsonb);
  v_out := v_out || 'T1 staff starts intake ok; ';
  BEGIN PERFORM public.tas_start_intake(v_stage, 'GTO1', '', '1', 'gto', 'r1'); v_out := v_out || 'T1b GTO start ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'T1b GTO refused ' || SQLSTATE || ' (want 22023); '; END;
  BEGIN PERFORM public.tas_staff_save_answers(v_i, 1, jsonb_build_array(jsonb_build_object('question_id', q1, 'value', '"x"', 'source_type', 'client_typed')));
    v_out := v_out || 'T1c staff using client source ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'T1c staff with client source refused ' || SQLSTATE || '; '; END;
  BEGIN PERFORM public.tas_client_save_answers(v_i, 1, '[]'::jsonb); v_out := v_out || 'T3c staff on client function ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'T3c staff on client function refused ' || SQLSTATE || ' (preview read-only); '; END;
  RESET ROLE;

  -- CLIENT A saves -------------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_ca, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_ca::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.tas_start_intake(v_stage, 'Z', '', '1', 'rto', 'r1'); v_out := v_out || 'T1d client start ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'T1d client start refused ' || SQLSTATE || '; '; END;
  v_rv := public.tas_client_save_answers(v_i, 1, jsonb_build_array(jsonb_build_object('question_id', q1, 'answer_state', 'answered', 'value', to_jsonb('secret-value'::text), 'source_type', 'client_button')));
  v_out := v_out || 'T2 client save -> row_version=' || v_rv || ' (want 2); ';
  BEGIN PERFORM public.tas_client_save_answers(v_i, v_rv, jsonb_build_array(jsonb_build_object('question_id', q2, 'value', '"x"', 'source_type', 'consultant_entered'))); v_out := v_out || 'T2b client with staff source ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'T2b client with staff source refused ' || SQLSTATE || '; '; END;
  BEGIN PERFORM public.tas_client_save_answers(v_i, v_rv, jsonb_build_array(jsonb_build_object('question_id', 'tas.nope.nothing.v1', 'value', '"x"', 'source_type', 'client_typed'))); v_out := v_out || 'T2c unknown question ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'T2c unknown question refused ' || SQLSTATE || ' (want 22023); '; END;
  BEGIN PERFORM public.tas_client_save_answers(v_i, 1, '[]'::jsonb); v_out := v_out || 'T2d stale save ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'T2d stale save refused ' || SQLSTATE || ' (want 40001); '; END;
  BEGIN PERFORM public.tas_staff_save_answers(v_i, v_rv, '[]'::jsonb); v_out := v_out || 'T3d client on staff function ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'T3d client on staff function refused ' || SQLSTATE || '; '; END;
  v_rv := public.tas_client_save_answers(v_i, v_rv, jsonb_build_array(
    jsonb_build_object('question_id', q2, 'answer_state', 'answered', 'value', to_jsonb('learners'::text), 'source_type', 'client_typed'),
    jsonb_build_object('question_id', q3, 'answer_state', 'not_decided', 'source_type', 'client_button')));
  v_out := v_out || 'T2e second save -> row_version=' || v_rv || ' (want 3); ';
  RESET ROLE;

  -- Detail check on stored answers (as owner)
  SELECT count(*) INTO v_n FROM public.tas_answer a JOIN public.tas_intake_version v ON v.id = a.version_id
   WHERE v.intake_id = v_i AND a.question_id = q1 AND a.review_state = 'client_reported' AND a.client_confirmed_by = v_ca
     AND a.original_value = a.value AND a.source_type = 'client_button';
  v_out := v_out || 'T2f stored answer: client_reported, confirmed by the client, original kept=' || v_n || ' (want 1); ';

  -- Existence is not revealed -----------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cb, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_cb::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.tas_client_save_answers(v_i, 3, '[]'::jsonb); EXCEPTION WHEN OTHERS THEN v_msg1 := SQLSTATE || ':' || SQLERRM; END;
  BEGIN PERFORM public.tas_client_save_answers(v_ghost, 3, '[]'::jsonb); EXCEPTION WHEN OTHERS THEN v_msg2 := SQLSTATE || ':' || SQLERRM; END;
  v_out := v_out || 'T3a other tenant vs unknown intake give the same error=' || (v_msg1 = v_msg2 AND v_msg1 IS NOT NULL) || ' [' || v_msg1 || '] (want true); ';
  RESET ROLE;

  UPDATE public.users SET disabled = true WHERE user_uuid = v_ca;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_ca, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_ca::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.tas_client_save_answers(v_i, 3, '[]'::jsonb); v_out := v_out || 'T3e disabled client ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'T3e disabled client refused ' || SQLSTATE || '; '; END;
  RESET ROLE;
  UPDATE public.users SET disabled = false WHERE user_uuid = v_ca;

  SET LOCAL ROLE anon;
  BEGIN PERFORM public.tas_client_save_answers(v_i, 3, '[]'::jsonb); v_out := v_out || 'T3f anon call ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'T3f anon call refused ' || SQLSTATE || ' (want 42501); '; END;
  RESET ROLE;

  -- CLIENT A submits ---------------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_ca, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_ca::text, true);
  SET LOCAL ROLE authenticated;
  v_ver1 := public.tas_client_submit(v_i, 3, k1);
  v_out := v_out || 'T4a idempotent submit same id=' || (v_ver1 = public.tas_client_submit(v_i, 3, k1)) || ' (want true); ';
  BEGIN PERFORM public.tas_client_save_answers(v_i, 4, '[]'::jsonb); v_out := v_out || 'T4c save after submit ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'T4c save after submit refused ' || SQLSTATE || '; '; END;
  BEGIN PERFORM public.tas_client_submit(v_i, 4, gen_random_uuid()); v_out := v_out || 'T4d second submit ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'T4d second submit refused ' || SQLSTATE || '; '; END;
  RESET ROLE;
  SELECT content_hash INTO v_hash1 FROM public.tas_intake_version WHERE id = v_ver1;
  v_out := v_out || 'T4b SHA-256 content hash length=' || length(v_hash1) || ' (want 64); ';

  -- Review ---------------------------------------------------------------------------------------------
  SELECT a.id INTO v_a1 FROM public.tas_answer a WHERE a.version_id = v_ver1 AND a.question_id = q1;
  SELECT a.id INTO v_a2 FROM public.tas_answer a WHERE a.version_id = v_ver1 AND a.question_id = q2;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_ca, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_ca::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.tas_staff_review_answer(v_a1, 'accept', 'ok'); v_out := v_out || 'T5a client review ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'T5a client review refused ' || SQLSTATE || '; '; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.tas_staff_review_answer(v_a1, 'accept', '  '); v_out := v_out || 'T5b blank reason ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'T5b blank reason refused ' || SQLSTATE || '; '; END;
  BEGIN PERFORM public.tas_staff_review_answer(v_a1, 'approve', 'ok'); v_out := v_out || 'T5c bad decision ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'T5c bad decision refused ' || SQLSTATE || '; '; END;
  PERFORM public.tas_staff_review_answer(v_a1, 'accept', 'matches the scope');
  PERFORM public.tas_staff_review_answer(v_a2, 'return', 'please give more detail');
  RESET ROLE;
  SELECT row_version INTO v_rv FROM public.tas_intake WHERE id = v_i;
  v_out := v_out || 'T5d status after review=' || (SELECT status FROM public.tas_intake WHERE id = v_i) || ' (want in_review), reviews=' || (SELECT count(*) FROM public.tas_answer_review) || ' (want 2); ';

  -- Return for edit (copy-on-return) -----------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.tas_staff_return_for_edit(v_i, v_rv - 1, 'more detail needed'); v_out := v_out || 'T6a stale return ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'T6a stale return refused ' || SQLSTATE || ' (want 40001); '; END;
  v_ver2 := public.tas_staff_return_for_edit(v_i, v_rv, 'more detail needed');
  RESET ROLE;
  v_out := v_out || 'T6b status=' || (SELECT status FROM public.tas_intake WHERE id = v_i) || ' (want returned); ';
  SELECT count(*) INTO v_n FROM public.tas_answer WHERE version_id = v_ver2 AND previous_answer_id IS NOT NULL;
  v_out := v_out || 'T6c answers copied into version 2 with lineage=' || v_n || ' (want 3); ';
  SELECT count(*) INTO v_n FROM public.tas_answer WHERE version_id = v_ver2 AND question_id = q2 AND review_state = 'returned';
  v_out := v_out || 'T6d returned answer starts as returned=' || v_n || ' (want 1); ';
  v_out := v_out || 'T6e version 1 still submitted=' || (SELECT state FROM public.tas_intake_version WHERE id = v_ver1) || '; ';

  -- Client edits version 2 and resubmits ------------------------------------------------------------------
  SELECT row_version INTO v_rv FROM public.tas_intake WHERE id = v_i;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_ca, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_ca::text, true);
  SET LOCAL ROLE authenticated;
  v_rv := public.tas_client_save_answers(v_i, v_rv, jsonb_build_array(jsonb_build_object('question_id', q2, 'answer_state', 'answered', 'value', to_jsonb('more learner detail'::text), 'source_type', 'client_typed')));
  v_ver2 := public.tas_client_submit(v_i, v_rv, k2);
  RESET ROLE;
  SELECT content_hash INTO v_hash2 FROM public.tas_intake_version WHERE id = v_ver2;
  v_out := v_out || 'T7a resubmitted; version 2 hash differs from version 1=' || (v_hash1 <> v_hash2) || ' (want true); ';
  SELECT count(*) INTO v_n FROM public.tas_answer WHERE version_id = v_ver2 AND question_id = q2 AND original_value = to_jsonb('learners'::text) AND value = to_jsonb('more learner detail'::text);
  v_out := v_out || 'T7b original client statement preserved across versions=' || v_n || ' (want 1); ';

  -- Redaction across versions --------------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_ca, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_ca::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.tas_staff_redact_answer(v_i, q1, 'erasure request'); v_out := v_out || 'T8a client redact ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'T8a client redact refused ' || SQLSTATE || '; '; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM public.tas_staff_redact_answer(v_i, q1, ''); v_out := v_out || 'T8b blank reason ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'T8b blank reason refused ' || SQLSTATE || '; '; END;
  v_n := public.tas_staff_redact_answer(v_i, q1, 'erasure request');
  v_out := v_out || 'T8c rows redacted across versions=' || v_n || ' (want 2); ';
  v_n := public.tas_staff_redact_answer(v_i, q1, 'again');
  v_out := v_out || 'T8d second call redacts nothing more=' || v_n || ' (want 0); ';
  RESET ROLE;
  SELECT count(*) INTO v_n FROM public.tas_answer a JOIN public.tas_intake_version v ON v.id = a.version_id
   WHERE v.intake_id = v_i AND a.question_id = q1 AND a.original_value IS NULL AND a.value = '{"redacted": true}'::jsonb;
  v_out := v_out || 'T8e no version still holds the original=' || v_n || ' of 2 (want 2); ';

  -- Audit trail ---------------------------------------------------------------------------------------------
  v_out := v_out || 'T9a audit actions start/save/submit/review/return/redact=' ||
    (SELECT count(*) FILTER (WHERE action = 'start') FROM public.tas_audit_event WHERE intake_id = v_i) || '/' ||
    (SELECT count(*) FILTER (WHERE action = 'save') FROM public.tas_audit_event WHERE intake_id = v_i) || '/' ||
    (SELECT count(*) FILTER (WHERE action = 'submit') FROM public.tas_audit_event WHERE intake_id = v_i) || '/' ||
    (SELECT count(*) FILTER (WHERE action = 'review') FROM public.tas_audit_event WHERE intake_id = v_i) || '/' ||
    (SELECT count(*) FILTER (WHERE action = 'return') FROM public.tas_audit_event WHERE intake_id = v_i) || '/' ||
    (SELECT count(*) FILTER (WHERE action = 'redact') FROM public.tas_audit_event WHERE intake_id = v_i) || ' (want 1/3/2/2/1/2); ';
  SELECT count(*) INTO v_n FROM public.tas_audit_event WHERE intake_id = v_i AND (coalesce(before_state::text,'') || coalesce(after_state::text,'') || coalesce(reason,'')) LIKE '%secret-value%';
  v_out := v_out || 'T9b audit rows carrying answer content=' || v_n || ' (want 0); ';

  -- Staff-run path on a second intake -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  SET LOCAL ROLE authenticated;
  v_i2 := public.tas_start_intake(v_stage, 'BSB50120', 'international 2027', '1', 'cricos', 'r1');
  v_rv := public.tas_staff_save_answers(v_i2, 1, jsonb_build_array(jsonb_build_object('question_id', q1, 'answer_state', 'answered', 'value', '"BSB50120"', 'source_type', 'prefill_tga', 'source_checked_at', '')));
  v_ver1 := public.tas_staff_submit(v_i2, v_rv, k3);
  RESET ROLE;
  SELECT count(*) INTO v_n FROM public.tas_answer WHERE version_id = v_ver1 AND source_checked_at IS NULL AND review_state = 'none';
  v_out := v_out || 'T10 staff-run intake with a second cohort submitted; unknown source date stays NULL=' || v_n || ' (want 1); ';
  SELECT count(*) INTO v_n FROM public.tas_audit_event WHERE intake_id = v_i2 AND actor_kind = 'staff' AND action IN ('start', 'save', 'submit');
  v_out := v_out || 'T10b staff audit rows=' || v_n || ' (want 3); ';

  RAISE EXCEPTION 'ROLLED-BACK RESULTS: %', v_out;
END $$;
