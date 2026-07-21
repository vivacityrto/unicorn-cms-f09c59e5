-- Update document_stage_usage view to include document_stage_links
DROP VIEW IF EXISTS public.document_stage_usage;

CREATE OR REPLACE VIEW public.document_stage_usage AS
SELECT
  d.id AS document_id,
  d.title,
  count(DISTINCT combined.stage_id) AS stage_count,
  array_agg(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL) AS stage_names
FROM public.documents d
LEFT JOIN (
  SELECT id AS document_id, stage AS stage_id FROM public.documents WHERE stage IS NOT NULL
  UNION
  SELECT document_id, stage_id FROM public.document_stage_links
) combined ON combined.document_id = d.id
LEFT JOIN public.stages s ON s.id = combined.stage_id
GROUP BY d.id, d.title;

ALTER VIEW public.document_stage_usage SET (security_invoker = true);

-- Update get_document_stage_usage function to include document_stage_links
CREATE OR REPLACE FUNCTION public.get_document_stage_usage(p_document_id bigint)
 RETURNS TABLE(stage_id bigint, stage_name text, package_count bigint, pinned_version_id uuid, pinned_version_number integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    s.id::bigint,
    s.name::text,
    (SELECT COUNT(DISTINCT ps.package_id) FROM public.package_stages ps WHERE ps.stage_id = s.id)::bigint,
    NULL::uuid,
    NULL::integer
  FROM public.documents d
  JOIN public.stages s ON s.id = d.stage
  WHERE d.id = p_document_id
    AND d.stage IS NOT NULL
  UNION
  SELECT
    s.id::bigint,
    s.name::text,
    (SELECT COUNT(DISTINCT ps.package_id) FROM public.package_stages ps WHERE ps.stage_id = s.id)::bigint,
    NULL::uuid,
    NULL::integer
  FROM public.document_stage_links dsl
  JOIN public.stages s ON s.id = dsl.stage_id
  WHERE dsl.document_id = p_document_id;
END;
$function$;