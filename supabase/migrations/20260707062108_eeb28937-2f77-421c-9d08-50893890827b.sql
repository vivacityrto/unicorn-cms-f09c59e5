-- PR-C repair v2: correct bulk document eligibility RPCs.
DROP FUNCTION IF EXISTS public.create_bulk_document_job(
  text, bigint[], bigint[], bigint[], bigint[], jsonb
);

CREATE OR REPLACE FUNCTION public.create_bulk_document_job(
  p_scope        text,
  p_tenant_ids   bigint[] DEFAULT NULL,
  p_package_ids  bigint[] DEFAULT NULL,
  p_stage_ids    bigint[] DEFAULT NULL,
  p_document_ids bigint[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller  uuid := auth.uid();
  v_job_id  uuid;
  v_missing bigint;
  v_total   int;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_vivacity_internal_safe(v_caller) THEN
    RAISE EXCEPTION 'Bulk generation requires Vivacity staff privileges' USING ERRCODE = '42501';
  END IF;

  IF p_scope NOT IN ('all','selected') THEN
    RAISE EXCEPTION 'scope must be all or selected' USING ERRCODE = '22023';
  END IF;

  IF p_scope = 'selected' AND (p_tenant_ids IS NULL OR array_length(p_tenant_ids,1) IS NULL) THEN
    RAISE EXCEPTION 'scope=selected requires p_tenant_ids' USING ERRCODE = '22023';
  END IF;

  IF array_length(p_tenant_ids, 1) IS NOT NULL THEN
    SELECT t INTO v_missing
    FROM unnest(p_tenant_ids) AS t
    WHERE NOT EXISTS (SELECT 1 FROM public.tenants x WHERE x.id = t)
    LIMIT 1;
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION 'tenant_id % does not exist', v_missing USING ERRCODE = '23503';
    END IF;
  END IF;

  IF array_length(p_package_ids, 1) IS NOT NULL THEN
    SELECT t INTO v_missing
    FROM unnest(p_package_ids) AS t
    WHERE NOT EXISTS (SELECT 1 FROM public.packages x WHERE x.id = t)
    LIMIT 1;
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION 'package_id % does not exist', v_missing USING ERRCODE = '23503';
    END IF;
  END IF;

  IF array_length(p_stage_ids, 1) IS NOT NULL THEN
    SELECT t INTO v_missing
    FROM unnest(p_stage_ids) AS t
    WHERE NOT EXISTS (SELECT 1 FROM public.stages x WHERE x.id::bigint = t)
    LIMIT 1;
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION 'stage_id % does not exist', v_missing USING ERRCODE = '23503';
    END IF;
  END IF;

  IF array_length(p_document_ids, 1) IS NOT NULL THEN
    SELECT t INTO v_missing
    FROM unnest(p_document_ids) AS t
    WHERE NOT EXISTS (SELECT 1 FROM public.documents x WHERE x.id = t)
    LIMIT 1;
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION 'document_id % does not exist', v_missing USING ERRCODE = '23503';
    END IF;
  END IF;

  INSERT INTO public.bulk_document_jobs (
    created_by, scope, tenant_ids, package_ids, stage_ids, document_ids,
    status, provisioning_summary, error_summary,
    total_items, generated_count, skipped_count, failed_count, started_at
  )
  VALUES (
    v_caller, p_scope,
    COALESCE(p_tenant_ids,   ARRAY[]::bigint[]),
    COALESCE(p_package_ids,  ARRAY[]::bigint[]),
    COALESCE(p_stage_ids,    ARRAY[]::bigint[]),
    COALESCE(p_document_ids, ARRAY[]::bigint[]),
    'running', '{}'::jsonb, '{}'::jsonb,
    0, 0, 0, 0, now()
  )
  RETURNING id INTO v_job_id;

  WITH eligible AS (
    SELECT DISTINCT
      t.id AS tenant_id,
      pi.id AS package_instance_id,
      si.id AS stageinstance_id,
      di.document_id,
      di.id AS document_instance_id,
      NULL::uuid AS document_version_id
    FROM public.tenants t
    JOIN public.package_instances pi
      ON pi.tenant_id = t.id
    JOIN public.stage_instances si
      ON si.packageinstance_id = pi.id
    JOIN public.document_instances di
      ON di.stageinstance_id = si.id
     AND di.tenant_id = t.id
    JOIN public.documents d
      ON d.id = di.document_id
    WHERE t.status = 'active'
      AND t.is_system_tenant = false
      AND pi.is_active = true
      AND pi.is_complete = false
      AND pi.membership_state = 'active'
      AND (p_scope = 'all' OR t.id = ANY(p_tenant_ids))
      AND (array_length(p_package_ids,1)  IS NULL OR pi.package_id       = ANY(p_package_ids))
      AND (array_length(p_stage_ids,1)    IS NULL OR si.stage_id::bigint = ANY(p_stage_ids))
      AND (array_length(p_document_ids,1) IS NULL OR d.id                = ANY(p_document_ids))
  ),
  inserted AS (
    INSERT INTO public.bulk_document_job_items (
      job_id, tenant_id, package_instance_id, stageinstance_id,
      document_id, document_instance_id, document_version_id, state, attempt_count
    )
    SELECT v_job_id, e.tenant_id, e.package_instance_id, e.stageinstance_id,
           e.document_id, e.document_instance_id, e.document_version_id, 'pending', 0
    FROM eligible e
    ON CONFLICT (job_id, tenant_id, document_id, stageinstance_id) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_total FROM inserted;

  UPDATE public.bulk_document_jobs
  SET total_items = v_total,
      status      = CASE WHEN v_total = 0 THEN 'completed' ELSE 'running' END,
      finished_at = CASE WHEN v_total = 0 THEN now() ELSE NULL END
  WHERE id = v_job_id;

  RETURN v_job_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_bulk_document_job(text, bigint[], bigint[], bigint[], bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_bulk_document_job(text, bigint[], bigint[], bigint[], bigint[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.preview_bulk_document_job(
  p_scope        text,
  p_tenant_ids   bigint[] DEFAULT NULL,
  p_package_ids  bigint[] DEFAULT NULL,
  p_stage_ids    bigint[] DEFAULT NULL,
  p_document_ids bigint[] DEFAULT NULL
)
RETURNS TABLE(
  eligible_count integer,
  distinct_tenants integer,
  distinct_packages integer,
  distinct_stages integer,
  distinct_documents integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_caller  uuid := auth.uid();
  v_missing bigint;
BEGIN
  IF v_caller IS NULL OR NOT public.is_vivacity_internal_safe(v_caller) THEN
    RAISE EXCEPTION 'Vivacity staff privileges required' USING ERRCODE = '42501';
  END IF;

  IF p_scope NOT IN ('all','selected') THEN
    RAISE EXCEPTION 'scope must be all or selected' USING ERRCODE = '22023';
  END IF;

  IF p_scope = 'selected' AND (p_tenant_ids IS NULL OR array_length(p_tenant_ids,1) IS NULL) THEN
    RAISE EXCEPTION 'scope=selected requires p_tenant_ids' USING ERRCODE = '22023';
  END IF;

  IF array_length(p_tenant_ids, 1) IS NOT NULL THEN
    SELECT t INTO v_missing
    FROM unnest(p_tenant_ids) AS t
    WHERE NOT EXISTS (SELECT 1 FROM public.tenants x WHERE x.id = t)
    LIMIT 1;
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION 'tenant_id % does not exist', v_missing USING ERRCODE = '23503';
    END IF;
  END IF;

  IF array_length(p_package_ids, 1) IS NOT NULL THEN
    SELECT t INTO v_missing
    FROM unnest(p_package_ids) AS t
    WHERE NOT EXISTS (SELECT 1 FROM public.packages x WHERE x.id = t)
    LIMIT 1;
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION 'package_id % does not exist', v_missing USING ERRCODE = '23503';
    END IF;
  END IF;

  IF array_length(p_stage_ids, 1) IS NOT NULL THEN
    SELECT t INTO v_missing
    FROM unnest(p_stage_ids) AS t
    WHERE NOT EXISTS (SELECT 1 FROM public.stages x WHERE x.id::bigint = t)
    LIMIT 1;
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION 'stage_id % does not exist', v_missing USING ERRCODE = '23503';
    END IF;
  END IF;

  IF array_length(p_document_ids, 1) IS NOT NULL THEN
    SELECT t INTO v_missing
    FROM unnest(p_document_ids) AS t
    WHERE NOT EXISTS (SELECT 1 FROM public.documents x WHERE x.id = t)
    LIMIT 1;
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION 'document_id % does not exist', v_missing USING ERRCODE = '23503';
    END IF;
  END IF;

  RETURN QUERY
  WITH eligible AS (
    SELECT DISTINCT
      t.id AS tenant_id,
      pi.id AS package_instance_id,
      si.id AS stageinstance_id,
      di.document_id
    FROM public.tenants t
    JOIN public.package_instances pi
      ON pi.tenant_id = t.id
    JOIN public.stage_instances si
      ON si.packageinstance_id = pi.id
    JOIN public.document_instances di
      ON di.stageinstance_id = si.id
     AND di.tenant_id = t.id
    JOIN public.documents d
      ON d.id = di.document_id
    WHERE t.status = 'active'
      AND t.is_system_tenant = false
      AND pi.is_active = true
      AND pi.is_complete = false
      AND pi.membership_state = 'active'
      AND (p_scope = 'all' OR t.id = ANY(p_tenant_ids))
      AND (array_length(p_package_ids,1)  IS NULL OR pi.package_id       = ANY(p_package_ids))
      AND (array_length(p_stage_ids,1)    IS NULL OR si.stage_id::bigint = ANY(p_stage_ids))
      AND (array_length(p_document_ids,1) IS NULL OR d.id                = ANY(p_document_ids))
  )
  SELECT COUNT(*)::int,
         COUNT(DISTINCT tenant_id)::int,
         COUNT(DISTINCT package_instance_id)::int,
         COUNT(DISTINCT stageinstance_id)::int,
         COUNT(DISTINCT document_id)::int
  FROM eligible;
END;
$function$;

REVOKE ALL ON FUNCTION public.preview_bulk_document_job(text, bigint[], bigint[], bigint[], bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_bulk_document_job(text, bigint[], bigint[], bigint[], bigint[]) TO authenticated;

NOTIFY pgrst, 'reload schema';