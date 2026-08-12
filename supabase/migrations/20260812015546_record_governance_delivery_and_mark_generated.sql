-- Hardening fix for deliver-governance-document: the edge function
-- previously updated document_instances (marking it "generated" with a
-- real SharePoint file) and THEN inserted into
-- governance_document_deliveries as two separate, non-transactional
-- Supabase client calls. If the second call failed for any reason after
-- the first succeeded, the result was a document_instance that looked
-- fully generated with a real file but had no delivery record at all --
-- confirmed against live data for one document (id 7362,
-- "Q3.D1-Trainers Handbook") across 25 instances generated 2026-05-11 and
-- 2026-06-05..08. See docs/audit-log entry for the investigation.
--
-- This function wraps both writes (plus resolving any open
-- document_generation_errors) in a single plpgsql function call, which
-- Postgres runs as one implicit transaction -- if any statement raises,
-- the whole call rolls back, so the two tables can never diverge again.
CREATE OR REPLACE FUNCTION public.record_governance_delivery_and_mark_generated(
  p_tenant_id bigint,
  p_document_id bigint,
  p_document_version_id uuid,
  p_snapshot_id uuid,
  p_sharepoint_item_id text,
  p_sharepoint_web_url text,
  p_delivered_file_name text,
  p_category_subfolder text,
  p_delivered_by uuid,
  p_tailoring_completeness_pct integer,
  p_missing_merge_fields jsonb,
  p_invalid_merge_fields jsonb,
  p_tailoring_risk_level text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
  v_delivery public.governance_document_deliveries%ROWTYPE;
BEGIN
  INSERT INTO public.governance_document_deliveries (
    tenant_id, document_id, document_version_id, snapshot_id, status,
    sharepoint_item_id, sharepoint_web_url, delivered_file_name, category_subfolder,
    delivered_by, tailoring_completeness_pct, missing_merge_fields, invalid_merge_fields,
    tailoring_risk_level
  ) VALUES (
    p_tenant_id, p_document_id, p_document_version_id, p_snapshot_id, 'success',
    p_sharepoint_item_id, p_sharepoint_web_url, p_delivered_file_name, p_category_subfolder,
    p_delivered_by, p_tailoring_completeness_pct, p_missing_merge_fields, p_invalid_merge_fields,
    p_tailoring_risk_level
  )
  RETURNING * INTO v_delivery;

  UPDATE public.document_instances
  SET status = 'generated',
      generation_status = 'generated',
      generated_file_url = p_sharepoint_web_url,
      generated_item_id = p_sharepoint_item_id,
      isgenerated = true,
      generationdate = now(),
      last_error = null,
      updated_by = p_delivered_by
  WHERE document_id = p_document_id
    AND tenant_id = p_tenant_id;

  UPDATE public.document_generation_errors dge
  SET resolved_at = now(),
      resolved_by = p_delivered_by
  FROM public.document_instances di
  WHERE dge.documentinstance_id = di.id
    AND di.document_id = p_document_id
    AND di.tenant_id = p_tenant_id
    AND dge.resolved_at IS NULL;

  RETURN to_jsonb(v_delivery);
END;
$$;
