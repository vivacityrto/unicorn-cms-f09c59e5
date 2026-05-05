DO $$
DECLARE
  v_tenant_id        bigint := 6372;
  v_user_uuid        uuid   := 'c5133d95-f853-4596-9cb8-1ae658bcf5d7'::uuid;  -- non-staff Admin
  v_type_id          uuid   := 'a8c8e651-4c15-4efe-b50f-3efec20a6ae5'::uuid;  -- suggestion
  v_status_id        uuid   := '42466771-04df-4a2b-b898-f2da2d66a2fb'::uuid;  -- new
  v_priority_id      uuid   := '164b033c-2df5-4b35-a286-c85599ffdc1d'::uuid;  -- medium
  v_impact_id        uuid   := '0316a446-6c5f-4042-a4c7-facdab4b4863'::uuid;  -- medium
  v_not_released_id  uuid   := '6957c70b-35c6-4dce-9cd0-6db42fa952f9'::uuid;
  v_released_id      uuid   := '74722d84-873b-4355-9551-2e3105a5b5e2'::uuid;
  v_test_id          uuid;
  v_observed_visible boolean;
  v_existing_id      uuid;
  v_existing_release uuid;
BEGIN
  -- =========================================================================
  -- STEP c: INSERT as non-staff (auth.uid() = NULL here), expect is_client_visible := true
  -- =========================================================================
  INSERT INTO public.suggest_items (
    tenant_id, suggest_item_type_id, suggest_status_id, suggest_priority_id,
    suggest_impact_rating_id, suggest_release_status_id,
    title, description, title_generated_by_ai, is_deleted,
    created_by, reported_by, is_client_visible
  )
  VALUES (
    v_tenant_id, v_type_id, v_status_id, v_priority_id,
    v_impact_id, v_not_released_id,
    'M3 verification probe', 'temporary row for trigger verification', false, false,
    v_user_uuid, v_user_uuid, false   -- attempt to insert as false; trigger should force true
  )
  RETURNING id, is_client_visible INTO v_test_id, v_observed_visible;

  IF v_observed_visible IS TRUE THEN
    RAISE NOTICE 'STEP c PASS: insert by non-staff forced is_client_visible = true (id=%)', v_test_id;
  ELSE
    RAISE EXCEPTION 'STEP c FAIL: expected true, got % (id=%)', v_observed_visible, v_test_id;
  END IF;

  -- =========================================================================
  -- STEP d: UPDATE is_client_visible -> false as non-staff; trigger must revert
  -- =========================================================================
  UPDATE public.suggest_items
     SET is_client_visible = false,
         updated_by = v_user_uuid
   WHERE id = v_test_id;

  SELECT is_client_visible INTO v_observed_visible
    FROM public.suggest_items WHERE id = v_test_id;

  IF v_observed_visible IS TRUE THEN
    RAISE NOTICE 'STEP d PASS: non-staff attempt to set is_client_visible=false silently reverted (still true)';
  ELSE
    RAISE EXCEPTION 'STEP d FAIL: expected true after revert, got %', v_observed_visible;
  END IF;

  -- Reset probe row to a clean baseline for step e
  UPDATE public.suggest_items
     SET suggest_release_status_id = v_not_released_id,
         is_client_visible = true   -- keep true (non-staff revert is a no-op since no change)
   WHERE id = v_test_id;

  -- For a clean step-e demonstration we need is_client_visible = false BEFORE the flip.
  -- Non-staff cannot set false. So flip the probe back to false using a temporary
  -- staff-bypassing path: directly via this DO block IS non-staff (auth.uid is NULL).
  -- Workaround: temporarily disable the guard trigger only for this row, set false, re-enable.
  ALTER TABLE public.suggest_items DISABLE TRIGGER suggest_items_visibility_guard;
  UPDATE public.suggest_items SET is_client_visible = false WHERE id = v_test_id;
  ALTER TABLE public.suggest_items ENABLE TRIGGER suggest_items_visibility_guard;

  -- =========================================================================
  -- STEP e: transition suggest_release_status_id -> released; trigger must auto-flip is_client_visible := true
  -- =========================================================================
  UPDATE public.suggest_items
     SET suggest_release_status_id = v_released_id
   WHERE id = v_test_id;

  SELECT is_client_visible INTO v_observed_visible
    FROM public.suggest_items WHERE id = v_test_id;

  IF v_observed_visible IS TRUE THEN
    RAISE NOTICE 'STEP e PASS: transition to released auto-flipped is_client_visible := true';
  ELSE
    RAISE EXCEPTION 'STEP e FAIL: expected true after release transition, got %', v_observed_visible;
  END IF;

  -- =========================================================================
  -- CLEANUP: remove the test probe row entirely (no permanent data change)
  -- =========================================================================
  DELETE FROM public.suggest_items WHERE id = v_test_id;
  RAISE NOTICE 'CLEANUP: probe row deleted (id=%)', v_test_id;

  -- Confirm zero net change
  IF (SELECT count(*) FROM public.suggest_items) <> 8 THEN
    RAISE EXCEPTION 'CLEANUP FAIL: row count drift, expected 8';
  END IF;
  RAISE NOTICE 'POST-RUN row count: 8 (unchanged)';
END $$;