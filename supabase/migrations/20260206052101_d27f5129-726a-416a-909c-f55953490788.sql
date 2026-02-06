-- Fix rpc_bulk_update_time_drafts to use package_instances instead of client_packages
CREATE OR REPLACE FUNCTION public.rpc_bulk_update_time_drafts(
  p_draft_ids uuid[],
  p_fields jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_updated_count int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_draft_id uuid;
  v_draft record;
  v_client_id bigint;
  v_package_id bigint;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Extract fields
  v_client_id := (p_fields->>'client_id')::bigint;
  v_package_id := (p_fields->>'package_id')::bigint;

  -- Process each draft
  FOREACH v_draft_id IN ARRAY p_draft_ids
  LOOP
    -- Get draft and verify ownership
    SELECT * INTO v_draft
    FROM public.calendar_time_drafts
    WHERE id = v_draft_id
      AND created_by = v_user_id
      AND status = 'draft';

    IF v_draft IS NULL THEN
      v_errors := v_errors || jsonb_build_object(
        'draft_id', v_draft_id,
        'error', 'Draft not found, not yours, or already processed'
      );
      CONTINUE;
    END IF;

    -- If package is set but client not in same tenant, clear package
    -- Use package_instances table (the actual data source)
    IF v_client_id IS NOT NULL AND v_package_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.package_instances
        WHERE package_id = v_package_id
          AND tenant_id = v_client_id
          AND is_complete = false
      ) THEN
        v_package_id := NULL;
      END IF;
    END IF;

    -- Update the draft
    UPDATE public.calendar_time_drafts
    SET
      client_id = COALESCE(v_client_id, client_id),
      package_id = CASE 
        WHEN v_client_id IS NOT NULL AND v_package_id IS NULL THEN NULL
        ELSE COALESCE(v_package_id, package_id)
      END,
      notes = COALESCE((p_fields->>'notes'), notes),
      is_billable = COALESCE((p_fields->>'is_billable')::boolean, is_billable),
      work_type = COALESCE(p_fields->>'work_type', work_type),
      updated_at = now()
    WHERE id = v_draft_id;

    v_updated_count := v_updated_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'updated_count', v_updated_count,
    'errors', v_errors
  );
END;
$$;

COMMENT ON FUNCTION public.rpc_bulk_update_time_drafts IS 'Bulk update time drafts - uses package_instances for validation';