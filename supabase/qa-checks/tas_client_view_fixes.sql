-- TAS client view fix checks (20261103080000_tas_client_view_fixes.sql). RUN ON unicorn-qa ONLY. One DO block
-- that ends by raising an exception carrying the results, so nothing is ever persisted. Look for the word BAD.
--
--   A. An answer removed (redacted) before the client confirmed it must not block the client's submit.
--   B. A returned answer that was confirmed before must need a fresh decision: it shows as not confirmed
--      in the summary and the client cannot submit until they confirm or flag it again.
DO $$
DECLARE
  v_staff uuid; v_stage bigint; v_ta bigint; v_ca uuid;
  v_ia uuid; v_ib uuid; v_rv int; v_s jsonb; v_a2 uuid;
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
  IF v_staff IS NULL OR v_stage IS NULL THEN RAISE EXCEPTION 'SETUP: personas missing'; END IF;
  INSERT INTO public.tas_question (question_id, schema_version, prompt, answer_kind, phase)
  VALUES (q1, '1', '[placeholder q1]', 'text', 'starter'), (q2, '1', '[placeholder q2]', 'text', 'starter'), (q3, '1', '[placeholder q3]', 'multi', 'starter');

  -- Staff start and release two intakes (cohorts a and b) --------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  SET LOCAL ROLE authenticated;
  v_ia := public.tas_start_intake(v_stage, 'BSB50120', 'a', '1', 'rto', 'r1');
  v_ib := public.tas_start_intake(v_stage, 'BSB50120', 'b', '1', 'rto', 'r1');
  PERFORM public.tas_staff_save_answers(v_ia, 1, jsonb_build_array(
    jsonb_build_object('question_id', q1, 'answer_state', 'answered', 'value', to_jsonb('BSB50120'::text), 'source_type', 'consultant_entered'),
    jsonb_build_object('question_id', q2, 'answer_state', 'answered', 'value', to_jsonb('adults'::text), 'source_type', 'consultant_entered'),
    jsonb_build_object('question_id', q3, 'answer_state', 'answered', 'value', to_jsonb('classroom'::text), 'source_type', 'consultant_entered')));
  PERFORM public.tas_staff_save_answers(v_ib, 1, jsonb_build_array(
    jsonb_build_object('question_id', q1, 'answer_state', 'answered', 'value', to_jsonb('BSB50120'::text), 'source_type', 'consultant_entered'),
    jsonb_build_object('question_id', q2, 'answer_state', 'answered', 'value', to_jsonb('adults'::text), 'source_type', 'consultant_entered'),
    jsonb_build_object('question_id', q3, 'answer_state', 'answered', 'value', to_jsonb('classroom'::text), 'source_type', 'consultant_entered')));
  SELECT row_version INTO v_rv FROM public.tas_intake WHERE id = v_ia;
  PERFORM public.tas_staff_release_to_client(v_ia, v_rv);
  SELECT row_version INTO v_rv FROM public.tas_intake WHERE id = v_ib;
  PERFORM public.tas_staff_release_to_client(v_ib, v_rv);
  RESET ROLE;

  -- A. client confirms q2 and q3 only; staff redact q1 before the client confirmed it; client submits --------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_ca, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_ca::text, true);
  SET LOCAL ROLE authenticated;
  SELECT row_version INTO v_rv FROM public.tas_intake WHERE id = v_ia;
  v_rv := public.tas_client_confirm_answers(v_ia, v_rv, jsonb_build_array(
    jsonb_build_object('question_id', q2, 'decision', 'confirm'), jsonb_build_object('question_id', q3, 'decision', 'confirm')));
  BEGIN PERFORM public.tas_client_submit(v_ia, v_rv, gen_random_uuid()); v_out := v_out || 'A1 submit with q1 still unconfirmed ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'A1 submit with q1 unconfirmed refused ' || SQLSTATE || ' (want 22023); '; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.tas_staff_redact_answer(v_ia, q1, 'erasure request');
  RESET ROLE;
  SELECT row_version INTO v_rv FROM public.tas_intake WHERE id = v_ia;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_ca, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_ca::text, true);
  SET LOCAL ROLE authenticated;
  v_s := public.tas_client_get_summary(v_ia);
  v_out := v_out || 'A2 q1 now removed in the summary=' || (SELECT count(*) FROM jsonb_array_elements(v_s->'answers') e WHERE e->>'question_id' = q1 AND (e->>'removed')::boolean) || ' (want 1); ';
  PERFORM public.tas_client_submit(v_ia, (v_s->'intake'->>'row_version')::int, gen_random_uuid());
  RESET ROLE;
  v_out := v_out || 'A3 submit with a removed unconfirmed answer worked, status=' || (SELECT status FROM public.tas_intake WHERE id = v_ia) || ' (want submitted); ';

  -- B. client confirms all three and submits; consultant returns q2; client must look at q2 again ---------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_ca, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_ca::text, true);
  SET LOCAL ROLE authenticated;
  SELECT row_version INTO v_rv FROM public.tas_intake WHERE id = v_ib;
  v_rv := public.tas_client_confirm_answers(v_ib, v_rv, jsonb_build_array(
    jsonb_build_object('question_id', q1, 'decision', 'confirm'), jsonb_build_object('question_id', q2, 'decision', 'confirm'),
    jsonb_build_object('question_id', q3, 'decision', 'confirm')));
  PERFORM public.tas_client_submit(v_ib, v_rv, gen_random_uuid());
  RESET ROLE;
  SELECT a.id INTO v_a2 FROM public.tas_answer a JOIN public.tas_intake_version v ON v.id = a.version_id
   WHERE v.intake_id = v_ib AND v.state = 'submitted' AND a.question_id = q2;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  SET LOCAL ROLE authenticated;
  PERFORM public.tas_staff_review_answer(v_a2, 'return', 'internal note');
  SELECT row_version INTO v_rv FROM public.tas_intake WHERE id = v_ib;
  PERFORM public.tas_staff_return_for_edit(v_ib, v_rv, 'internal note');
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_ca, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_ca::text, true);
  SET LOCAL ROLE authenticated;
  v_s := public.tas_client_get_summary(v_ib);
  v_out := v_out || 'B1 after return: confirmed/flagged=' || (v_s->'counts'->>'confirmed') || '/' || (v_s->'counts'->>'flagged') || ' (want 2/0); ';
  v_out := v_out || 'B2 returned answer shows confirmed=false and returned=true: ' ||
    (SELECT count(*) FROM jsonb_array_elements(v_s->'answers') e WHERE e->>'question_id' = q2 AND NOT (e->>'confirmed')::boolean AND (e->>'returned')::boolean) || ' (want 1); ';
  BEGIN PERFORM public.tas_client_submit(v_ib, (v_s->'intake'->>'row_version')::int, gen_random_uuid()); v_out := v_out || 'B3 resubmit without revisiting ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'B3 resubmit without revisiting refused ' || SQLSTATE || ' (want 22023); '; END;
  v_rv := public.tas_client_confirm_answers(v_ib, (v_s->'intake'->>'row_version')::int, jsonb_build_array(jsonb_build_object('question_id', q2, 'decision', 'confirm')));
  v_s := public.tas_client_get_summary(v_ib);
  v_out := v_out || 'B4 after confirming again: confirmed/returned=' || (v_s->'counts'->>'confirmed') || '/' ||
    (SELECT count(*) FROM jsonb_array_elements(v_s->'answers') e WHERE (e->>'returned')::boolean) || ' (want 3/0); ';
  PERFORM public.tas_client_submit(v_ib, (v_s->'intake'->>'row_version')::int, gen_random_uuid());
  RESET ROLE;
  v_out := v_out || 'B5 resubmitted, status=' || (SELECT status FROM public.tas_intake WHERE id = v_ib) || ' (want submitted); ';

  RAISE EXCEPTION 'ROLLED-BACK RESULTS: %', v_out;
END $$;
