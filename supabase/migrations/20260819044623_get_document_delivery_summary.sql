-- Aggregates governance_document_deliveries server-side (distinct tenant
-- count + last delivered timestamp per document), so the Manage Documents
-- admin list doesn't need to pull every raw delivery row to the browser and
-- risk PostgREST's default 1000-row cap silently truncating results as this
-- table grows (confirmed live 2026-08-19: a naive client-side .select() +
-- .in('document_id', docIds) query already returns exactly 1000 rows and
-- misses recently-delivered documents whose rows fall outside that cap).
CREATE OR REPLACE FUNCTION public.get_document_delivery_summary(p_document_ids bigint[])
 RETURNS TABLE(document_id bigint, delivered_tenant_count bigint, last_delivered_at timestamptz)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT gdd.document_id, count(DISTINCT gdd.tenant_id), max(gdd.delivered_at)
  FROM public.governance_document_deliveries gdd
  WHERE gdd.status = 'success'
    AND (p_document_ids IS NULL OR gdd.document_id = ANY(p_document_ids))
  GROUP BY gdd.document_id;
$function$;

-- Mirrors governance_document_deliveries' own SELECT RLS (is_vivacity_team_safe
-- OR tenant membership) rather than widening access: staff always pass this
-- check, and this RPC is only ever called from the staff-only Manage
-- Documents admin list, so a staff-only gate is the correct scope (not a
-- tenant-membership fallback, which that page never needs).
CREATE OR REPLACE FUNCTION public.get_document_delivery_summary_secure(p_document_ids bigint[])
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

-- Drop the unguarded helper — kept only as an intermediate step above,
-- the secure wrapper is the one actually granted to authenticated callers.
DROP FUNCTION IF EXISTS public.get_document_delivery_summary(bigint[]);

REVOKE ALL ON FUNCTION public.get_document_delivery_summary_secure(bigint[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_document_delivery_summary_secure(bigint[]) TO authenticated;
