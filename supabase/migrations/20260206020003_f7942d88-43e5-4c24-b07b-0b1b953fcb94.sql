-- Fix security invoker setting on v_portal_documents_unified view
-- The view should use security_invoker = true (already set, but recreating to ensure it's correct)

DROP VIEW IF EXISTS public.v_portal_documents_unified;

CREATE VIEW public.v_portal_documents_unified 
WITH (security_invoker = true)
AS
SELECT 
  pd.id,
  pd.tenant_id,
  'portal' AS document_type,
  pd.file_name,
  pd.file_type,
  pd.file_size,
  pd.storage_path,
  pdc.name AS category_name,
  pd.tags,
  pd.direction,
  pd.is_client_visible,
  pd.status,
  pd.version_number,
  pd.source,
  pd.description,
  pd.uploaded_by,
  COALESCE(u.first_name || ' ' || u.last_name, 'Unknown') AS uploaded_by_name,
  CASE WHEN pd.direction = 'vivacity_to_client' THEN 'Vivacity' ELSE 'Client' END AS uploaded_by_type,
  pd.uploaded_at,
  pd.shared_at,
  pd.linked_package_id,
  pd.linked_stage_id,
  pd.evidence_request_item_id,
  pd.deleted_at
FROM public.portal_documents pd
LEFT JOIN public.portal_document_categories pdc ON pdc.id = pd.category_id
LEFT JOIN public.users u ON u.user_uuid = pd.uploaded_by
WHERE pd.deleted_at IS NULL

UNION ALL

SELECT 
  gd.id::uuid,
  gd.tenant_id::bigint,
  'generated' AS document_type,
  gd.file_name,
  NULL AS file_type,
  NULL AS file_size,
  gd.file_path AS storage_path,
  d.category AS category_name,
  ARRAY[]::text[] AS tags,
  COALESCE(gd.direction, 'vivacity_to_client') AS direction,
  COALESCE(gd.is_client_visible, false) AS is_client_visible,
  gd.status,
  1 AS version_number,
  'generated' AS source,
  d.description,
  gd.generated_by AS uploaded_by,
  COALESCE(u.first_name || ' ' || u.last_name, 'Unknown') AS uploaded_by_name,
  'Vivacity' AS uploaded_by_type,
  gd.generated_at AS uploaded_at,
  gd.shared_at,
  gd.package_id AS linked_package_id,
  gd.stage_id AS linked_stage_id,
  NULL::uuid AS evidence_request_item_id,
  NULL::timestamptz AS deleted_at
FROM public.generated_documents gd
LEFT JOIN public.documents d ON d.id = gd.source_document_id
LEFT JOIN public.users u ON u.user_uuid = gd.generated_by;

COMMENT ON VIEW public.v_portal_documents_unified IS 'Unified view of portal documents and generated documents for the two-way document hub';