-- Fix: '' IS NOT NULL evaluates to true in SQL, causing empty-string
-- storage_path rows to be incorrectly counted as "templated" while the
-- worker's JS !!version.storage_path check correctly treats them as
-- no-template. Wrap all three template-source fields in NULLIF(...,'')
-- for defense in depth.

CREATE OR REPLACE FUNCTION public.get_bulk_generate_client_tree(p_tenant_ids bigint[])
 RETURNS TABLE(tenant_id bigint, package_id bigint, package_instance_id bigint, package_name text, stage_id bigint, stage_name text, templated_doc_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller  uuid := auth.uid();
  v_missing bigint;
BEGIN
  IF v_caller IS NULL OR NOT public.is_vivacity_internal_safe(v_caller) THEN
    RAISE EXCEPTION 'Vivacity staff privileges required' USING ERRCODE = '42501';
  END IF;

  IF p_tenant_ids IS NULL OR array_length(p_tenant_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'p_tenant_ids is required and must be non-empty' USING ERRCODE = '22023';
  END IF;

  SELECT t INTO v_missing
  FROM unnest(p_tenant_ids) AS t
  WHERE NOT EXISTS (SELECT 1 FROM public.tenants x WHERE x.id = t)
  LIMIT 1;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'tenant_id % does not exist', v_missing USING ERRCODE = '23503';
  END IF;

  RETURN QUERY
  SELECT
    t.id                              AS tenant_id,
    pi.package_id                     AS package_id,
    pi.id                             AS package_instance_id,
    p.name                            AS package_name,
    si.stage_id::bigint               AS stage_id,
    s.name                            AS stage_name,
    COUNT(DISTINCT d.id)::int         AS templated_doc_count
  FROM public.tenants t
  JOIN public.package_instances pi
    ON pi.tenant_id = t.id
  JOIN public.packages p
    ON p.id = pi.package_id
  JOIN public.stage_instances si
    ON si.packageinstance_id = pi.id
  JOIN public.stages s
    ON s.id::bigint = si.stage_id::bigint
  JOIN public.document_instances di
    ON di.stageinstance_id = si.id
   AND di.tenant_id = t.id
  JOIN public.documents d
    ON d.id = di.document_id
  WHERE t.id = ANY(p_tenant_ids)
    AND t.status = 'active'
    AND t.is_system_tenant = false
    AND pi.is_active = true
    AND pi.is_complete = false
    AND pi.membership_state = 'active'
    AND (
      NULLIF(d.source_template_url, '') IS NOT NULL
      OR EXISTS (
        SELECT 1
        FROM public.document_versions dv
        WHERE dv.document_id = d.id
          AND (NULLIF(dv.storage_path, '') IS NOT NULL
               OR NULLIF(dv.frozen_storage_path, '') IS NOT NULL)
      )
    )
  GROUP BY t.id, pi.package_id, pi.id, p.name, si.stage_id, s.name
  HAVING COUNT(DISTINCT d.id) > 0
  ORDER BY t.id, p.name, s.name;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_bulk_generate_client_tree(bigint[]) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_bulk_generate_client_tree(bigint[]) TO authenticated;


CREATE OR REPLACE FUNCTION public.preview_targeted_bulk_document_job(p_selections jsonb, p_document_ids bigint[] DEFAULT NULL::bigint[])
 RETURNS TABLE(eligible_count integer, distinct_tenants integer, distinct_packages integer, distinct_stages integer, distinct_documents integer, fully_provisioned_tenants integer, needs_provisioning_tenants integer, missing_shared_tenants integer, missing_governance_tenants integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_caller  uuid := auth.uid();
  v_missing bigint;
BEGIN
  IF v_caller IS NULL OR NOT public.is_vivacity_internal_safe(v_caller) THEN
    RAISE EXCEPTION 'Vivacity staff privileges required' USING ERRCODE = '42501';
  END IF;

  IF p_selections IS NULL OR jsonb_typeof(p_selections) <> 'array' THEN
    RAISE EXCEPTION 'p_selections must be a JSON array' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_selections) = 0 THEN
    RAISE EXCEPTION 'p_selections must be non-empty' USING ERRCODE = '22023';
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
  WITH raw_sel AS (
    SELECT (elem->>'tenant_id')::bigint  AS tenant_id,
           (elem->>'package_id')::bigint AS package_id,
           elem->'stage_ids'             AS stage_ids
    FROM jsonb_array_elements(p_selections) AS elem
  ),
  triples AS (
    SELECT r.tenant_id, r.package_id, (s.value)::text::bigint AS stage_id
    FROM raw_sel r
    CROSS JOIN LATERAL jsonb_array_elements(r.stage_ids) AS s(value)
  ),
  eligible AS (
    SELECT DISTINCT
      t.id AS tenant_id,
      pi.id AS package_instance_id,
      si.id AS stageinstance_id,
      di.document_id
    FROM public.tenants t
    JOIN public.package_instances pi ON pi.tenant_id = t.id
    JOIN public.stage_instances si   ON si.packageinstance_id = pi.id
    JOIN public.document_instances di ON di.stageinstance_id = si.id
                                     AND di.tenant_id = t.id
    JOIN public.documents d          ON d.id = di.document_id
    JOIN triples tr
      ON tr.tenant_id  = t.id
     AND tr.package_id = pi.package_id
     AND tr.stage_id   = si.stage_id::bigint
    WHERE t.status = 'active'
      AND t.is_system_tenant = false
      AND pi.is_active = true
      AND pi.is_complete = false
      AND pi.membership_state = 'active'
      AND (array_length(p_document_ids,1) IS NULL OR d.id = ANY(p_document_ids))
      AND (
        NULLIF(d.source_template_url, '') IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM public.document_versions dv
          WHERE dv.document_id = d.id
            AND (NULLIF(dv.storage_path, '') IS NOT NULL
                 OR NULLIF(dv.frozen_storage_path, '') IS NOT NULL)
        )
      )
  ),
  etenants AS (SELECT DISTINCT tenant_id FROM eligible),
  sp AS (
    SELECT et.tenant_id,
           COALESCE(s.provisioning_status = 'success'
                    OR s.validation_status = 'valid', false)  AS has_shared,
           (s.governance_folder_item_id IS NOT NULL)          AS has_governance
    FROM etenants et
    LEFT JOIN public.tenant_sharepoint_settings s
      ON s.tenant_id = et.tenant_id
  )
  SELECT
    (SELECT COUNT(*)                            FROM eligible)::int,
    (SELECT COUNT(DISTINCT tenant_id)           FROM eligible)::int,
    (SELECT COUNT(DISTINCT package_instance_id) FROM eligible)::int,
    (SELECT COUNT(DISTINCT stageinstance_id)    FROM eligible)::int,
    (SELECT COUNT(DISTINCT document_id)         FROM eligible)::int,
    (SELECT COUNT(*) FROM sp WHERE has_shared AND has_governance)::int,
    (SELECT COUNT(*) FROM sp WHERE NOT (has_shared AND has_governance))::int,
    (SELECT COUNT(*) FROM sp WHERE NOT has_shared)::int,
    (SELECT COUNT(*) FROM sp WHERE NOT has_governance)::int;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.preview_targeted_bulk_document_job(jsonb, bigint[]) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_targeted_bulk_document_job(jsonb, bigint[]) TO authenticated;


CREATE OR REPLACE FUNCTION public.create_targeted_bulk_document_job(p_selections jsonb, p_document_ids bigint[] DEFAULT NULL::bigint[])
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

  IF p_selections IS NULL OR jsonb_typeof(p_selections) <> 'array' THEN
    RAISE EXCEPTION 'p_selections must be a JSON array' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_selections) = 0 THEN
    RAISE EXCEPTION 'p_selections must be non-empty' USING ERRCODE = '22023';
  END IF;

  SELECT (elem->>'tenant_id')::bigint INTO v_missing
  FROM jsonb_array_elements(p_selections) AS elem
  WHERE NOT EXISTS (
    SELECT 1 FROM public.tenants x WHERE x.id = (elem->>'tenant_id')::bigint
  )
  LIMIT 1;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'tenant_id % does not exist', v_missing USING ERRCODE = '23503';
  END IF;

  SELECT (elem->>'package_id')::bigint INTO v_missing
  FROM jsonb_array_elements(p_selections) AS elem
  WHERE NOT EXISTS (
    SELECT 1 FROM public.packages x WHERE x.id = (elem->>'package_id')::bigint
  )
  LIMIT 1;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'package_id % does not exist', v_missing USING ERRCODE = '23503';
  END IF;

  SELECT sid INTO v_missing
  FROM jsonb_array_elements(p_selections) AS elem
  CROSS JOIN LATERAL jsonb_array_elements(elem->'stage_ids') AS s(value)
  CROSS JOIN LATERAL (SELECT (s.value)::text::bigint AS sid) AS x
  WHERE NOT EXISTS (SELECT 1 FROM public.stages y WHERE y.id::bigint = x.sid)
  LIMIT 1;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'stage_id % does not exist', v_missing USING ERRCODE = '23503';
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
    total_items, generated_count, skipped_count, failed_count, started_at,
    selections
  )
  VALUES (
    v_caller, 'selected',
    COALESCE(
      (SELECT array_agg(DISTINCT (elem->>'tenant_id')::bigint)
         FROM jsonb_array_elements(p_selections) AS elem),
      ARRAY[]::bigint[]
    ),
    COALESCE(
      (SELECT array_agg(DISTINCT (elem->>'package_id')::bigint)
         FROM jsonb_array_elements(p_selections) AS elem),
      ARRAY[]::bigint[]
    ),
    COALESCE(
      (SELECT array_agg(DISTINCT (s.value)::text::bigint)
         FROM jsonb_array_elements(p_selections) AS elem
         CROSS JOIN LATERAL jsonb_array_elements(elem->'stage_ids') AS s(value)),
      ARRAY[]::bigint[]
    ),
    COALESCE(p_document_ids, ARRAY[]::bigint[]),
    'running', '{}'::jsonb, '{}'::jsonb,
    0, 0, 0, 0, now(),
    p_selections
  )
  RETURNING id INTO v_job_id;

  WITH raw_sel AS (
    SELECT (elem->>'tenant_id')::bigint  AS tenant_id,
           (elem->>'package_id')::bigint AS package_id,
           elem->'stage_ids'             AS stage_ids
    FROM jsonb_array_elements(p_selections) AS elem
  ),
  triples AS (
    SELECT r.tenant_id, r.package_id, (s.value)::text::bigint AS stage_id
    FROM raw_sel r
    CROSS JOIN LATERAL jsonb_array_elements(r.stage_ids) AS s(value)
  ),
  eligible AS (
    SELECT DISTINCT
      t.id AS tenant_id,
      pi.id AS package_instance_id,
      si.id AS stageinstance_id,
      di.document_id,
      di.id AS document_instance_id,
      NULL::uuid AS document_version_id
    FROM public.tenants t
    JOIN public.package_instances pi ON pi.tenant_id = t.id
    JOIN public.stage_instances si   ON si.packageinstance_id = pi.id
    JOIN public.document_instances di ON di.stageinstance_id = si.id
                                     AND di.tenant_id = t.id
    JOIN public.documents d          ON d.id = di.document_id
    JOIN triples tr
      ON tr.tenant_id  = t.id
     AND tr.package_id = pi.package_id
     AND tr.stage_id   = si.stage_id::bigint
    WHERE t.status = 'active'
      AND t.is_system_tenant = false
      AND pi.is_active = true
      AND pi.is_complete = false
      AND pi.membership_state = 'active'
      AND (array_length(p_document_ids,1) IS NULL OR d.id = ANY(p_document_ids))
      AND (
        NULLIF(d.source_template_url, '') IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM public.document_versions dv
          WHERE dv.document_id = d.id
            AND (NULLIF(dv.storage_path, '') IS NOT NULL
                 OR NULLIF(dv.frozen_storage_path, '') IS NOT NULL)
        )
      )
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

REVOKE EXECUTE ON FUNCTION public.create_targeted_bulk_document_job(jsonb, bigint[]) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_targeted_bulk_document_job(jsonb, bigint[]) TO authenticated;
