DO $$
DECLARE
  v_staff_uuid       uuid := '384cf51f-87f5-479b-a9c4-a2293be84e3a'::uuid;
  v_client_uuid      uuid := '18565bb8-775d-4172-a4e1-ad9f79335e2a'::uuid;
  v_tenant_id        bigint := 5;
  v_type_id          uuid := 'a8c8e651-4c15-4efe-b50f-3efec20a6ae5'::uuid;
  v_status_id        uuid := '42466771-04df-4a2b-b898-f2da2d66a2fb'::uuid;
  v_priority_id      uuid := '164b033c-2df5-4b35-a286-c85599ffdc1d'::uuid;
  v_impact_id        uuid := '0316a446-6c5f-4042-a4c7-facdab4b4863'::uuid;
  v_not_released_id  uuid := '6957c70b-35c6-4dce-9cd0-6db42fa952f9'::uuid;
  v_probe_item_id    uuid;
  v_probe_attach_id  uuid;
  v_count            integer;
  v_baseline_items   integer;
BEGIN
  SELECT count(*) INTO v_baseline_items FROM public.suggest_items;

  ALTER TABLE public.suggest_items DISABLE TRIGGER suggest_items_visibility_guard;
  ALTER TABLE public.suggest_items DISABLE TRIGGER suggest_items_force_client_visibility;

  INSERT INTO public.suggest_items (
    tenant_id, suggest_item_type_id, suggest_status_id, suggest_priority_id,
    suggest_impact_rating_id, suggest_release_status_id,
    title, description, title_generated_by_ai, is_deleted,
    created_by, reported_by, is_client_visible
  )
  VALUES (
    v_tenant_id, v_type_id, v_status_id, v_priority_id,
    v_impact_id, v_not_released_id,
    'M4 verification probe', 'temporary', false, false,
    v_client_uuid, v_client_uuid, false
  )
  RETURNING id INTO v_probe_item_id;

  ALTER TABLE public.suggest_items ENABLE TRIGGER suggest_items_visibility_guard;
  ALTER TABLE public.suggest_items ENABLE TRIGGER suggest_items_force_client_visibility;

  INSERT INTO public.suggest_attachments (
    tenant_id, suggest_item_id, file_name, file_path,
    file_size_bytes, mime_type, attachment_kind, created_by
  )
  VALUES (
    v_tenant_id::integer, v_probe_item_id, 'probe.txt',
    v_tenant_id::text || '/' || v_probe_item_id::text || '/probe.txt',
    10, 'text/plain', 'file', v_client_uuid
  )
  RETURNING id INTO v_probe_attach_id;

  -- (a) staff, hidden parent
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_staff_uuid::text, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_count FROM public.suggest_attachments WHERE id = v_probe_attach_id;
  RESET ROLE;
  IF v_count = 1 THEN RAISE NOTICE 'STEP a PASS (count=1)';
  ELSE RAISE EXCEPTION 'STEP a FAIL: expected 1, got %', v_count; END IF;

  -- (b) client, hidden parent
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_client_uuid::text, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_count FROM public.suggest_attachments WHERE id = v_probe_attach_id;
  RESET ROLE;
  IF v_count = 0 THEN RAISE NOTICE 'STEP b PASS (count=0)';
  ELSE RAISE EXCEPTION 'STEP b FAIL: expected 0, got %', v_count; END IF;

  -- (c) flip parent visible, client should see
  ALTER TABLE public.suggest_items DISABLE TRIGGER suggest_items_visibility_guard;
  UPDATE public.suggest_items SET is_client_visible = true WHERE id = v_probe_item_id;
  ALTER TABLE public.suggest_items ENABLE TRIGGER suggest_items_visibility_guard;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_client_uuid::text, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_count FROM public.suggest_attachments WHERE id = v_probe_attach_id;
  RESET ROLE;
  IF v_count = 1 THEN RAISE NOTICE 'STEP c PASS (count=1)';
  ELSE RAISE EXCEPTION 'STEP c FAIL: expected 1, got %', v_count; END IF;

  DELETE FROM public.suggest_attachments WHERE id = v_probe_attach_id;
  DELETE FROM public.suggest_items WHERE id = v_probe_item_id;

  IF (SELECT count(*) FROM public.suggest_items) <> v_baseline_items THEN
    RAISE EXCEPTION 'CLEANUP FAIL: drift';
  END IF;
  RAISE NOTICE 'CLEANUP OK: suggest_items count restored to %', v_baseline_items;
END $$;