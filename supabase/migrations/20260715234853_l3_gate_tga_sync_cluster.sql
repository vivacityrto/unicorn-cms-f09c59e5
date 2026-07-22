
-- L3 (16 Jul 2026 addendum): TGA sync cluster. All three are SECURITY DEFINER,
-- RPC-callable by any authenticated user, with zero caller-identity check.
-- No other public function calls any of these (confirmed via prosrc search),
-- so the only caller is the frontend directly invoking the RPC -- this is a
-- staff-only "TGA Sync" admin workflow, never a client action, and no
-- dedicated permission_features key exists for it, so the gate is
-- is_vivacity_team_safe(auth.uid()), matching the pattern already used for
-- schedule_audit_phase / sync_audit_actions_to_client_items.
--
-- persist_tga_scope_items is the most serious of the three: it lets any
-- authenticated caller UPSERT fully attacker-controlled JSON (code, title,
-- status, tga_data) directly into tenant_rto_scope -- a CRICOS/compliance
-- scope-of-registration table -- for ANY tenant_id, with no tenant-access or
-- staff check at all. tga_swap_scope_from_staging additionally lets any
-- caller wholesale DELETE + replace a tenant's live scope table from staging
-- rows matching an attacker-supplied tenant_id/sync_run_id pair.

create or replace function public.tga_start_staged_sync(
  p_tenant_id bigint,
  p_rto_code text,
  p_triggered_by uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_run_id uuid;
  v_stages text[] := ARRAY['rto_summary', 'contacts', 'addresses', 'delivery_sites', 'scope_quals', 'scope_units', 'scope_skills', 'scope_courses'];
  v_stage text;
  v_job_count int := 0;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden: staff only');
  END IF;

  p_triggered_by := auth.uid();

  -- Create import run
  INSERT INTO tga_import_runs (id, run_type, status, started_at, created_by)
  VALUES (gen_random_uuid(), 'staged_sync', 'running', now(), p_triggered_by)
  RETURNING id INTO v_run_id;

  -- Create staged jobs
  FOREACH v_stage IN ARRAY v_stages LOOP
    INSERT INTO tga_rto_import_jobs (
      id, tenant_id, rto_code, status, job_type, stage, run_id, created_by
    ) VALUES (
      gen_random_uuid(), p_tenant_id, p_rto_code, 'queued', 'staged', v_stage, v_run_id, p_triggered_by
    );
    v_job_count := v_job_count + 1;
  END LOOP;

  -- Create audit record
  INSERT INTO tga_import_audit (tenant_id, triggered_by, rto_code, run_id, action, status, metadata)
  VALUES (p_tenant_id, p_triggered_by, p_rto_code, v_run_id, 'sync_now', 'started',
    jsonb_build_object('jobs_created', v_job_count, 'stages', v_stages));

  RETURN jsonb_build_object(
    'success', true,
    'run_id', v_run_id,
    'jobs_created', v_job_count,
    'stages', v_stages
  );
END;
$function$;

create or replace function public.tga_swap_scope_from_staging(
  p_tenant_id bigint,
  p_sync_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_staged_count int;
  v_deleted_count int;
  v_inserted_count int;
  v_counts jsonb;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RETURN jsonb_build_object('error', 'Forbidden: staff only');
  END IF;

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
$function$;

create or replace function public.persist_tga_scope_items(
  p_tenant_id integer,
  p_scope_type text,
  p_scope_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  _inserted_count INT := 0;
  _item JSONB;
BEGIN
  IF NOT public.is_vivacity_team_safe(auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden: staff only');
  END IF;

  IF p_scope_type NOT IN ('qualification', 'unit', 'skillset', 'accreditedCourse', 'trainingPackage') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid scope_type');
  END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(p_scope_items)
  LOOP
    INSERT INTO public.tenant_rto_scope (
      id, tenant_id, code, title, scope_type, status, is_superseded, superseded_by, tga_data, last_refreshed_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      p_tenant_id,
      COALESCE(_item->>'code', _item->>'Code', ''),
      COALESCE(_item->>'title', _item->>'Title', _item->>'name', ''),
      p_scope_type,
      COALESCE(_item->>'statusLabel', _item->>'status', 'current'),
      COALESCE((_item->>'isSuperseded')::boolean, false),
      _item->>'supersededBy',
      _item,
      NOW(),
      NOW()
    )
    ON CONFLICT (tenant_id, code, scope_type)
    DO UPDATE SET
      title = EXCLUDED.title,
      status = EXCLUDED.status,
      is_superseded = EXCLUDED.is_superseded,
      superseded_by = EXCLUDED.superseded_by,
      tga_data = EXCLUDED.tga_data,
      last_refreshed_at = NOW(),
      updated_at = NOW();

    _inserted_count := _inserted_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'items_persisted', _inserted_count);
END;
$function$;

NOTIFY pgrst, 'reload schema';
