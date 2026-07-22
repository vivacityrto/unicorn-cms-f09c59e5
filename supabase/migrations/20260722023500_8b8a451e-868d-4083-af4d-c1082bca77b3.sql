-- Fix service-role passthrough on four staff-gated SECURITY DEFINER functions.
-- Mirrors the pattern live in public.add_package_to_tenant: only enforce the
-- staff check when auth.uid() is non-null. Service-role callers (edge functions)
-- have no JWT and were being unconditionally rejected since the mid-July hardening pass.
-- Also removes a stray `p_triggered_by := auth.uid()` overwrite in tga_start_staged_sync
-- that was silently discarding the verified caller id passed by the edge function.

CREATE OR REPLACE FUNCTION public.tga_swap_scope_from_staging(p_tenant_id bigint, p_sync_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_staged_count int;
  v_deleted_count int;
  v_inserted_count int;
  v_counts jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL
     AND NOT public.is_vivacity_team_safe((SELECT auth.uid())) THEN
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

CREATE OR REPLACE FUNCTION public.tga_start_staged_sync(p_tenant_id bigint, p_rto_code text, p_triggered_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run_id uuid;
  v_stages text[] := ARRAY['rto_summary', 'contacts', 'addresses', 'delivery_sites', 'scope_quals', 'scope_units', 'scope_skills', 'scope_courses'];
  v_stage text;
  v_job_count int := 0;
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL
     AND NOT public.is_vivacity_team_safe((SELECT auth.uid())) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden: staff only');
  END IF;

  -- Note: previously overwrote p_triggered_by with auth.uid() here, which discarded
  -- the verified caller id passed explicitly by the edge function. Removed.

  INSERT INTO tga_import_runs (id, run_type, status, started_at, created_by)
  VALUES (gen_random_uuid(), 'staged_sync', 'running', now(), p_triggered_by)
  RETURNING id INTO v_run_id;

  FOREACH v_stage IN ARRAY v_stages LOOP
    INSERT INTO tga_rto_import_jobs (
      id, tenant_id, rto_code, status, job_type, stage, run_id, created_by
    ) VALUES (
      gen_random_uuid(), p_tenant_id, p_rto_code, 'queued', 'staged', v_stage, v_run_id, p_triggered_by
    );
    v_job_count := v_job_count + 1;
  END LOOP;

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

CREATE OR REPLACE FUNCTION public.upsert_excel_template_bindings(p_document_id bigint, p_detected_tokens jsonb, p_detected_dropdowns jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_binding_id uuid;
  v_existing_token_bindings jsonb;
  v_existing_dropdown_bindings jsonb;
  v_merged_token_bindings jsonb := '{}'::jsonb;
  v_merged_dropdown_bindings jsonb := '{}'::jsonb;
  v_token record;
  v_dropdown record;
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL
     AND NOT public.is_vivacity_team_safe((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  SELECT id, token_bindings, dropdown_bindings
  INTO v_binding_id, v_existing_token_bindings, v_existing_dropdown_bindings
  FROM public.excel_template_bindings
  WHERE document_id = p_document_id;

  IF v_existing_token_bindings IS NOT NULL THEN
    FOR v_token IN SELECT jsonb_array_elements(p_detected_tokens) AS token
    LOOP
      IF v_existing_token_bindings ? (v_token.token->>'token') THEN
        v_merged_token_bindings := v_merged_token_bindings ||
          jsonb_build_object(v_token.token->>'token', v_existing_token_bindings->(v_token.token->>'token'));
      END IF;
    END LOOP;
  END IF;

  IF v_existing_dropdown_bindings IS NOT NULL THEN
    FOR v_dropdown IN SELECT jsonb_array_elements(p_detected_dropdowns) AS dropdown
    LOOP
      IF v_existing_dropdown_bindings ? (v_dropdown.dropdown->>'dropdown_id') THEN
        v_merged_dropdown_bindings := v_merged_dropdown_bindings ||
          jsonb_build_object(v_dropdown.dropdown->>'dropdown_id', v_existing_dropdown_bindings->(v_dropdown.dropdown->>'dropdown_id'));
      END IF;
    END LOOP;
  END IF;

  INSERT INTO public.excel_template_bindings (
    document_id, detected_tokens, detected_dropdowns, token_bindings,
    dropdown_bindings, binding_version, status, updated_at
  )
  VALUES (
    p_document_id, p_detected_tokens, p_detected_dropdowns,
    v_merged_token_bindings, v_merged_dropdown_bindings,
    COALESCE((SELECT binding_version + 1 FROM public.excel_template_bindings WHERE document_id = p_document_id), 1),
    'draft', now()
  )
  ON CONFLICT (document_id)
  DO UPDATE SET
    detected_tokens = EXCLUDED.detected_tokens,
    detected_dropdowns = EXCLUDED.detected_dropdowns,
    token_bindings = v_merged_token_bindings,
    dropdown_bindings = v_merged_dropdown_bindings,
    binding_version = public.excel_template_bindings.binding_version + 1,
    status = 'draft',
    updated_at = now()
  RETURNING id INTO v_binding_id;

  RETURN v_binding_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.stall_bulk_document_job(p_job_id uuid, p_reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_updated int;
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL
     AND NOT public.is_vivacity_team_safe((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  UPDATE public.bulk_document_jobs
     SET status = 'stalled',
         error_summary = COALESCE(error_summary, '{}'::jsonb) || jsonb_build_object(
           'stalled_reason', p_reason,
           'stalled_at', now()
         )
   WHERE id = p_job_id AND status = 'running';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$function$;