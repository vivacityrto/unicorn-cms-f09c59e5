-- preview_bulk_document_job: extend RETURNS TABLE with four new SharePoint-provisioning
-- breakdown counters. Signature (arg list) is unchanged. Body computes the new counts in
-- one extra CTE against tenant_sharepoint_settings, scoped to the same eligible tenants as
-- the existing counters -- no N+1 from the frontend.
--
-- Postgres cannot alter a RETURNS TABLE shape via CREATE OR REPLACE, so this migration
-- drops and recreates. No other function, view, or SQL object references this function's
-- return type; the launcher edge function calls it via supabase.rpc(...) over HTTP and
-- reads columns by name, so the drop-and-recreate is safe.

DROP FUNCTION IF EXISTS public.preview_bulk_document_job(text, bigint[], bigint[], bigint[], bigint[]);

CREATE OR REPLACE FUNCTION public.preview_bulk_document_job(
  p_scope        text,
  p_tenant_ids   bigint[] DEFAULT NULL,
  p_package_ids  bigint[] DEFAULT NULL,
  p_stage_ids    bigint[] DEFAULT NULL,
  p_document_ids bigint[] DEFAULT NULL
)
RETURNS TABLE(
  eligible_count             integer,
  distinct_tenants           integer,
  distinct_packages          integer,
  distinct_stages            integer,
  distinct_documents         integer,
  fully_provisioned_tenants  integer,
  needs_provisioning_tenants integer,
  missing_shared_tenants     integer,
  missing_governance_tenants integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
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
  ),
  etenants AS (
    SELECT DISTINCT tenant_id FROM eligible
  ),
  sp AS (
    SELECT et.tenant_id,
           COALESCE(s.provisioning_status = 'success'
                    OR s.validation_status = 'valid', false)      AS has_shared,
           (s.governance_folder_item_id IS NOT NULL)              AS has_governance
      FROM etenants et
      LEFT JOIN public.tenant_sharepoint_settings s
        ON s.tenant_id = et.tenant_id
  )
  SELECT
    (SELECT COUNT(*)                          FROM eligible)::int,
    (SELECT COUNT(DISTINCT tenant_id)         FROM eligible)::int,
    (SELECT COUNT(DISTINCT package_instance_id) FROM eligible)::int,
    (SELECT COUNT(DISTINCT stageinstance_id)  FROM eligible)::int,
    (SELECT COUNT(DISTINCT document_id)       FROM eligible)::int,
    (SELECT COUNT(*) FROM sp WHERE has_shared AND has_governance)::int,
    (SELECT COUNT(*) FROM sp WHERE NOT (has_shared AND has_governance))::int,
    (SELECT COUNT(*) FROM sp WHERE NOT has_shared)::int,
    (SELECT COUNT(*) FROM sp WHERE NOT has_governance)::int;
END;
$function$;

REVOKE ALL ON FUNCTION public.preview_bulk_document_job(text, bigint[], bigint[], bigint[], bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_bulk_document_job(text, bigint[], bigint[], bigint[], bigint[]) TO authenticated;

NOTIFY pgrst, 'reload schema';