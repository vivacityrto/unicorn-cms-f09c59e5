-- Migration A: get_bulk_generate_client_tree
-- Returns per-(tenant, package, stage) qualifying rows for the targeted-mode
-- mission-control view. Structurally different from preview_bulk_document_job:
-- one row per (tenant, package, stage) that has >=1 templated document.
--
-- Templated predicate mirrors the worker's hasTemplate check
-- (bulk-generate-documents-worker/index.ts):
--   documents.source_template_url IS NOT NULL, OR
--   document_versions.storage_path IS NOT NULL, OR
--   document_versions.frozen_storage_path IS NOT NULL
--
-- HAVING COUNT > 0 guarantees packages with zero qualifying stages simply
-- do not appear at all (matches the "10 packages with zero doc-generating
-- stages" filter from the investigation, applied at source).

CREATE OR REPLACE FUNCTION public.get_bulk_generate_client_tree(
  p_tenant_ids bigint[]
)
RETURNS TABLE (
  tenant_id           bigint,
  package_id          bigint,
  package_instance_id bigint,
  package_name        text,
  stage_id            bigint,
  stage_name          text,
  templated_doc_count integer
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
      d.source_template_url IS NOT NULL
      OR EXISTS (
        SELECT 1
        FROM public.document_versions dv
        WHERE dv.document_id = d.id
          AND (dv.storage_path IS NOT NULL OR dv.frozen_storage_path IS NOT NULL)
      )
    )
  GROUP BY t.id, pi.package_id, pi.id, p.name, si.stage_id, s.name
  HAVING COUNT(DISTINCT d.id) > 0
  ORDER BY t.id, p.name, s.name;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_bulk_generate_client_tree(bigint[]) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_bulk_generate_client_tree(bigint[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
