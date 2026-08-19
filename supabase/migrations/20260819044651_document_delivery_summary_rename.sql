-- Rename to match this codebase's convention (no "_secure" suffix on other
-- staff-gated RPCs, e.g. stall_bulk_document_job, create_bulk_document_job).
DROP FUNCTION IF EXISTS public.get_document_delivery_summary_secure(bigint[]);

CREATE OR REPLACE FUNCTION public.get_document_delivery_summary(p_document_ids bigint[])
 RETURNS TABLE(document_id bigint, delivered_tenant_count bigint, last_delivered_at timestamptz)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.is_vivacity_internal_safe(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT gdd.document_id, count(DISTINCT gdd.tenant_id), max(gdd.delivered_at)
  FROM public.governance_document_deliveries gdd
  WHERE gdd.status = 'success'
    AND (p_document_ids IS NULL OR gdd.document_id = ANY(p_document_ids))
  GROUP BY gdd.document_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_document_delivery_summary(bigint[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_document_delivery_summary(bigint[]) TO authenticated;
