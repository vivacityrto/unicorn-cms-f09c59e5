CREATE OR REPLACE VIEW public.v_client_governance_documents
WITH (security_invoker = true)
AS
SELECT
  di.id,
  di.tenant_id,
  di.document_id,
  di.generationdate,
  di.generated_file_url,
  di.status,
  di.document_title,
  d.title          AS doc_title,
  d.description,
  d.category,
  d.framework_type,
  STRING_AGG(DISTINCT p.name, ', ' ORDER BY p.name) AS active_package_names
FROM public.document_instances di
JOIN public.documents d ON d.id = di.document_id
LEFT JOIN public.stage_instances si ON si.id = di.stageinstance_id
LEFT JOIN public.package_instances pi
  ON pi.id = si.packageinstance_id
  AND pi.membership_state = 'active'
LEFT JOIN public.packages p ON p.id = pi.package_id
GROUP BY
  di.id, di.tenant_id, di.document_id, di.generationdate,
  di.generated_file_url, di.status, di.document_title,
  d.title, d.description, d.category, d.framework_type;

GRANT SELECT ON public.v_client_governance_documents TO authenticated;
GRANT SELECT ON public.v_client_governance_documents TO service_role;