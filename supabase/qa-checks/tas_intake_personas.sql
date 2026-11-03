-- TAS intake persona and guard checks. RUN ON unicorn-qa ONLY. Everything runs inside one DO block
-- that ends by raising an exception carrying the results, so nothing is ever persisted.
--
-- Covers 20261103050000_tas_intake_tables.sql: read access by persona, direct writes refused,
-- GTO refused, stage/tenant check, intake key and optional cohort label, the freeze, the redaction
-- path (and everything that is not a redaction), and append-only tables.
-- Each result line ends with the expectation; "BAD" marks a failure. Look for the word BAD.
DO $$
DECLARE
  v_staff uuid; v_stage bigint; v_ta bigint; v_tb bigint; v_ca uuid; v_cb uuid;
  v_i1 uuid; v_i2 uuid; v_ver uuid; v_a1 uuid; v_a2 uuid; v_a3 uuid; v_rev uuid;
  v_out text := ''; v_n int; v_q text;
  q1 text := 'tas.product.code_title.v1'; q2 text := 'tas.cohort.typical_learners.v1'; q3 text := 'tas.delivery.modes.v1';
  tbl text;
BEGIN
  -- Personas ------------------------------------------------------------------------------------
  SELECT user_uuid INTO v_staff FROM public.users WHERE is_vivacity_internal AND NOT disabled AND NOT archived LIMIT 1;
  SELECT si.id, pi.tenant_id, tu.user_id INTO v_stage, v_ta, v_ca
  FROM public.stage_instances si JOIN public.package_instances pi ON pi.id = si.packageinstance_id
  JOIN public.tenant_users tu ON tu.tenant_id = pi.tenant_id AND tu.access_scope = 'full'
  JOIN public.users u ON u.user_uuid = tu.user_id AND NOT u.disabled AND NOT u.archived AND NOT u.is_vivacity_internal
  WHERE public.tenant_is_writeable(pi.tenant_id) AND tu.role <> 'parent' LIMIT 1;  -- a parent cannot be academy_only (check constraint)
  SELECT tu.tenant_id, tu.user_id INTO v_tb, v_cb
  FROM public.tenant_users tu JOIN public.users u ON u.user_uuid = tu.user_id AND NOT u.disabled AND NOT u.archived AND NOT u.is_vivacity_internal
  WHERE tu.access_scope = 'full' AND tu.tenant_id <> v_ta LIMIT 1;
  IF v_staff IS NULL OR v_stage IS NULL OR v_cb IS NULL THEN RAISE EXCEPTION 'SETUP: personas missing'; END IF;

  -- Fixtures, written as the table owner ---------------------------------------------------------
  INSERT INTO public.tas_question (question_id, schema_version, prompt, answer_kind, phase)
  VALUES (q1, '1', '[placeholder]', 'text', 'starter'), (q2, '1', '[placeholder]', 'text', 'starter'), (q3, '1', '[placeholder]', 'multi', 'starter');
  INSERT INTO public.tas_intake (tenant_id, stage_instance_id, qualification_code, schema_version, client_type, ruleset_version, created_by)
  VALUES (v_ta, v_stage, 'BSB50120', '1', 'rto', 'r1', v_staff) RETURNING id INTO v_i1;
  INSERT INTO public.tas_intake_version (intake_id, tenant_id, version_no) VALUES (v_i1, v_ta, 1) RETURNING id INTO v_ver;
  INSERT INTO public.tas_answer (version_id, tenant_id, question_id, schema_version, answer_state, value, original_value, source_type)
  VALUES (v_ver, v_ta, q1, '1', 'answered', '{"code":"X"}', '{"code":"X"}', 'prefill_tga') RETURNING id INTO v_a1;
  INSERT INTO public.tas_answer (version_id, tenant_id, question_id, schema_version, answer_state, value, original_value, source_type)
  VALUES (v_ver, v_ta, q2, '1', 'answered', '{"v":"y"}', '{"v":"y"}', 'client_typed') RETURNING id INTO v_a2;
  INSERT INTO public.tas_answer (version_id, tenant_id, question_id, schema_version, answer_state, value, original_value, source_type)
  VALUES (v_ver, v_ta, q3, '1', 'answered', '["classroom"]', '["classroom"]', 'client_button') RETURNING id INTO v_a3;
  INSERT INTO public.tas_answer_review (answer_id, tenant_id, decision, reason, decided_by) VALUES (v_a1, v_ta, 'accept', 'ok', v_staff) RETURNING id INTO v_rev;
  INSERT INTO public.tas_audit_event (tenant_id, intake_id, actor_user_id, actor_kind, action, target_type) VALUES (v_ta, v_i1, v_staff, 'staff', 'fixture', 'tas_intake');

  -- P: who can read what ------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  SET LOCAL ROLE authenticated;
  v_out := v_out || 'P1 staff reads intake/version/answer/review/audit/question=' ||
    (SELECT count(*) FROM public.tas_intake) || '/' || (SELECT count(*) FROM public.tas_intake_version) || '/' || (SELECT count(*) FROM public.tas_answer) || '/' ||
    (SELECT count(*) FROM public.tas_answer_review) || '/' || (SELECT count(*) FROM public.tas_audit_event) || '/' || (SELECT count(*) FROM public.tas_question) || ' (want 1/1/3/1/1/3); ';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_ca, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_ca::text, true);
  SET LOCAL ROLE authenticated;
  v_out := v_out || 'P2 client A reads intake/version/answer/review/audit/question=' ||
    (SELECT count(*) FROM public.tas_intake) || '/' || (SELECT count(*) FROM public.tas_intake_version) || '/' || (SELECT count(*) FROM public.tas_answer) || '/' ||
    (SELECT count(*) FROM public.tas_answer_review) || '/' || (SELECT count(*) FROM public.tas_audit_event) || '/' || (SELECT count(*) FROM public.tas_question) || ' (want 1/1/3/0/0/0); ';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_cb, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_cb::text, true);
  SET LOCAL ROLE authenticated;
  v_out := v_out || 'P3 client B (other tenant) reads ' ||
    (SELECT count(*) FROM public.tas_intake) || '/' || (SELECT count(*) FROM public.tas_intake_version) || '/' || (SELECT count(*) FROM public.tas_answer) || '/' ||
    (SELECT count(*) FROM public.tas_answer_review) || '/' || (SELECT count(*) FROM public.tas_audit_event) || ' (want 0/0/0/0/0); ';
  RESET ROLE;

  UPDATE public.users SET disabled = true WHERE user_uuid = v_ca;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_ca, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_ca::text, true);
  SET LOCAL ROLE authenticated;
  v_out := v_out || 'P4 disabled client A reads intake=' || (SELECT count(*) FROM public.tas_intake) || ' (want 0); ';
  RESET ROLE;
  UPDATE public.users SET disabled = false WHERE user_uuid = v_ca;

  UPDATE public.tenant_users SET access_scope = 'academy_only' WHERE user_id = v_ca AND tenant_id = v_ta;
  SET LOCAL ROLE authenticated;
  v_out := v_out || 'P5 academy-only client reads intake=' || (SELECT count(*) FROM public.tas_intake) || ' (want 0); ';
  RESET ROLE;
  UPDATE public.tenant_users SET access_scope = 'full' WHERE user_id = v_ca AND tenant_id = v_ta;

  SET LOCAL ROLE anon;
  BEGIN PERFORM count(*) FROM public.tas_intake; v_out := v_out || 'P6 anon read ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'P6 anon refused ' || SQLSTATE || ' (want 42501); '; END;
  RESET ROLE;

  -- W: direct writes by a signed-in client are refused on every table -----------------------------
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_ca, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_ca::text, true);
  SET LOCAL ROLE authenticated;
  FOREACH tbl IN ARRAY ARRAY['tas_question','tas_intake','tas_intake_version','tas_answer','tas_answer_review','tas_audit_event'] LOOP
    BEGIN EXECUTE format('UPDATE public.%I SET %I = %I WHERE false', tbl, CASE WHEN tbl = 'tas_question' THEN 'prompt' ELSE 'id' END, CASE WHEN tbl = 'tas_question' THEN 'prompt' ELSE 'id' END); v_out := v_out || 'W update ' || tbl || ' ALLOWED (BAD); ';
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE <> '42501' THEN v_out := v_out || 'W update ' || tbl || ' unexpected ' || SQLSTATE || ' (BAD); '; END IF; END;
    BEGIN EXECUTE format('DELETE FROM public.%I WHERE false', tbl); v_out := v_out || 'W delete ' || tbl || ' ALLOWED (BAD); ';
    EXCEPTION WHEN OTHERS THEN IF SQLSTATE <> '42501' THEN v_out := v_out || 'W delete ' || tbl || ' unexpected ' || SQLSTATE || ' (BAD); '; END IF; END;
  END LOOP;
  BEGIN INSERT INTO public.tas_intake (tenant_id, stage_instance_id, qualification_code, schema_version, client_type, ruleset_version, created_by) VALUES (v_ta, v_stage, 'Z', '1', 'rto', 'r1', v_ca); v_out := v_out || 'W insert intake ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'W direct writes refused for all six tables, insert refused ' || SQLSTATE || '; '; END;
  RESET ROLE;

  -- D: constraints and triggers (as the table owner) ----------------------------------------------
  PERFORM set_config('request.jwt.claims', '', true); PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN INSERT INTO public.tas_intake (tenant_id, stage_instance_id, qualification_code, schema_version, client_type, ruleset_version, created_by) VALUES (v_ta, v_stage, 'GTO1', '1', 'gto', 'r1', v_staff); v_out := v_out || 'D1 GTO client ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'D1 GTO client refused ' || SQLSTATE || ' (want 23514); '; END;
  BEGIN INSERT INTO public.tas_intake (tenant_id, stage_instance_id, qualification_code, schema_version, client_type, ruleset_version, created_by) VALUES (v_tb, v_stage, 'MIS', '1', 'rto', 'r1', v_staff); v_out := v_out || 'D2 stage of another tenant ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'D2 stage/tenant mismatch refused ' || SQLSTATE || ' (want 42501); '; END;
  BEGIN INSERT INTO public.tas_intake (tenant_id, stage_instance_id, qualification_code, schema_version, client_type, ruleset_version, created_by) VALUES (v_ta, v_stage, 'BSB50120', '1', 'cricos', 'r1', v_staff); v_out := v_out || 'D3 duplicate key ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'D3 duplicate key refused ' || SQLSTATE || ' (want 23505); '; END;
  INSERT INTO public.tas_intake (tenant_id, stage_instance_id, qualification_code, cohort_label, schema_version, client_type, ruleset_version, created_by)
  VALUES (v_ta, v_stage, 'BSB50120', 'international 2027', '1', 'cricos', 'r1', v_staff) RETURNING id INTO v_i2;
  v_out := v_out || 'D4 second cohort label allowed; ';
  BEGIN INSERT INTO public.tas_answer (version_id, tenant_id, question_id, schema_version, source_type) VALUES (v_ver, v_ta, q1, '1', 'ai_inference'); v_out := v_out || 'D5 ai source ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'D5 ai source refused ' || SQLSTATE || ' (want 23514); '; END;
  BEGIN DELETE FROM public.tas_answer WHERE id = v_a3; v_out := v_out || 'D6 delete draft answer ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'D6 delete refused ' || SQLSTATE || '; '; END;
  UPDATE public.tas_answer SET value = '{"code":"Y"}' WHERE id = v_a1;
  v_out := v_out || 'D7 draft answer edit allowed; ';
  BEGIN UPDATE public.tas_answer SET original_value = '{"code":"Z"}' WHERE id = v_a1; v_out := v_out || 'D8 overwrite original ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'D8 overwrite original refused ' || SQLSTATE || '; '; END;
  BEGIN UPDATE public.tas_answer SET question_id = q2 WHERE id = v_a1; v_out := v_out || 'D9 move answer ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'D9 move answer refused ' || SQLSTATE || '; '; END;

  -- F: freeze ---------------------------------------------------------------------------------------
  UPDATE public.tas_intake_version SET state = 'submitted', submitted_at = now(), content_hash = 'h' WHERE id = v_ver;
  v_out := v_out || 'F0 version submitted; ';
  BEGIN UPDATE public.tas_answer SET value = '{"code":"Q"}' WHERE id = v_a2; v_out := v_out || 'F1 edit frozen answer ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'F1 edit frozen answer refused ' || SQLSTATE || '; '; END;
  BEGIN UPDATE public.tas_answer SET answer_state = 'needs_advice' WHERE id = v_a2; v_out := v_out || 'F2 change state of frozen answer ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'F2 state change refused ' || SQLSTATE || '; '; END;
  BEGIN INSERT INTO public.tas_answer (version_id, tenant_id, question_id, schema_version, source_type) VALUES (v_ver, v_ta, 'tas.product.training_type.v1', '1', 'client_typed'); v_out := v_out || 'F3 insert into frozen ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'F3 insert into frozen refused ' || SQLSTATE || ' (any refusal ok); '; END;
  BEGIN UPDATE public.tas_intake_version SET state = 'draft' WHERE id = v_ver; v_out := v_out || 'F4 unfreeze ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'F4 unfreeze refused ' || SQLSTATE || '; '; END;
  BEGIN DELETE FROM public.tas_intake WHERE id = v_i1; v_out := v_out || 'F5 delete intake ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'F5 delete intake refused ' || SQLSTATE || '; '; END;

  -- R: redaction is the one permitted change on a frozen answer -------------------------------------
  BEGIN UPDATE public.tas_answer SET value = '{"redacted": true}', original_value = NULL, redacted_at = now(), redacted_by = v_staff, answer_state = 'not_decided' WHERE id = v_a2; v_out := v_out || 'R1 redaction that also changes another column ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'R1 redaction + other change refused ' || SQLSTATE || '; '; END;
  BEGIN UPDATE public.tas_answer SET value = '{"redacted": false}', original_value = NULL, redacted_at = now(), redacted_by = v_staff WHERE id = v_a2; v_out := v_out || 'R2 wrong marker ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'R2 wrong marker refused ' || SQLSTATE || '; '; END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_ca, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_ca::text, true);
  BEGIN UPDATE public.tas_answer SET value = '{"redacted": true}', original_value = NULL, redacted_at = now(), redacted_by = v_ca WHERE id = v_a2; v_out := v_out || 'R3 client redaction ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'R3 client redaction refused ' || SQLSTATE || '; '; END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  PERFORM set_config('tas.redaction_reason', 'erasure request', true);
  UPDATE public.tas_answer SET value = '{"redacted": true}', original_value = NULL, redacted_at = now(), redacted_by = v_staff WHERE id = v_a2;
  SELECT count(*) INTO v_n FROM public.tas_audit_event WHERE action = 'redact' AND target_id = v_a2 AND actor_kind = 'staff' AND reason = 'erasure request';
  v_out := v_out || 'R4 staff redaction allowed, audit rows (staff, with reason)=' || v_n || ' (want 1); ';
  PERFORM set_config('request.jwt.claims', '', true); PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('tas.redaction_reason', '', true);
  UPDATE public.tas_answer SET value = '{"redacted": true}', original_value = NULL, redacted_at = now(), redacted_by = v_staff WHERE id = v_a1;
  SELECT count(*) INTO v_n FROM public.tas_audit_event WHERE action = 'redact' AND target_id = v_a1 AND actor_kind = 'system' AND reason = 'unspecified';
  v_out := v_out || 'R5 owner/service redaction allowed, audited as system/unspecified=' || v_n || ' (want 1); ';
  BEGIN UPDATE public.tas_answer SET value = '{"redacted": true}', redacted_at = now() WHERE id = v_a1; v_out := v_out || 'R6 change a redacted answer ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'R6 redacted answer is final, change refused ' || SQLSTATE || '; '; END;
  SELECT count(*) INTO v_n FROM public.tas_answer WHERE id IN (v_a1, v_a2) AND original_value IS NULL AND value = '{"redacted": true}'::jsonb;
  v_out := v_out || 'R7 redacted answers hold no original or personal value=' || v_n || ' (want 2); ';

  -- A: append-only ----------------------------------------------------------------------------------
  BEGIN UPDATE public.tas_answer_review SET reason = 'changed' WHERE id = v_rev; v_out := v_out || 'A1 edit review ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'A1 review is append-only ' || SQLSTATE || '; '; END;
  BEGIN DELETE FROM public.tas_audit_event WHERE true; v_out := v_out || 'A2 delete audit ALLOWED (BAD); ';
  EXCEPTION WHEN OTHERS THEN v_out := v_out || 'A2 audit is append-only ' || SQLSTATE || '; '; END;

  RAISE EXCEPTION 'ROLLED-BACK RESULTS: %', v_out;
END $$;
