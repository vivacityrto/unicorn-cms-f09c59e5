CREATE OR REPLACE FUNCTION tga_swap_scope_from_staging(p_tenant_id bigint, p_sync_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staged_count int;
  v_deleted_count int;
  v_inserted_count int;
  v_counts jsonb;
BEGIN
  SELECT count(*) INTO v_staged_count
  FROM tenant_rto_scope_staging
  WHERE tenant_id = p_tenant_id AND sync_run_id = p_sync_run_id;

  IF v_staged_count = 0 THEN
    RETURN jsonb_build_object('error', 'No staged rows found', 'staged', 0);
  END IF;

  SELECT jsonb_object_agg(scope_type, cnt)
  INTO v_counts
  FROM (
    SELECT scope_type, count(*) as cnt
    FROM tenant_rto_scope_staging
    WHERE tenant_id = p_tenant_id AND sync_run_id = p_sync_run_id
    GROUP BY scope_type
  ) sub;

  DELETE FROM tenant_rto_scope WHERE tenant_id = p_tenant_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Use DISTINCT ON to prevent duplicate key violations from staging duplicates
  INSERT INTO tenant_rto_scope (id, tenant_id, code, title, scope_type, status, is_superseded, superseded_by, tga_data, last_refreshed_at, created_at, updated_at)
  SELECT DISTINCT ON (tenant_id, code, scope_type)
    id, tenant_id, code, title, scope_type, status, is_superseded, superseded_by, tga_data, last_refreshed_at, created_at, updated_at
  FROM tenant_rto_scope_staging
  WHERE tenant_id = p_tenant_id AND sync_run_id = p_sync_run_id
  ORDER BY tenant_id, code, scope_type, created_at DESC;
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  DELETE FROM tenant_rto_scope_staging
  WHERE tenant_id = p_tenant_id AND sync_run_id = p_sync_run_id;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_old', v_deleted_count,
    'inserted_new', v_inserted_count,
    'counts_by_type', v_counts
  );
END;
$$;