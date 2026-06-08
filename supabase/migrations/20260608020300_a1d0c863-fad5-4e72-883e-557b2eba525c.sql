CREATE OR REPLACE VIEW public.v_client_governance_documents AS
WITH ranked AS (
  SELECT di.id,
    di.tenant_id,
    di.document_id,
    di.generationdate,
    di.generated_file_url,
    di.status,
    di.document_title,
    di.stageinstance_id,
    pi.id AS pi_id,
    pi.start_date AS pi_start_date,
    p.name AS package_name,
    row_number() OVER (PARTITION BY di.tenant_id, di.document_id ORDER BY pi.start_date DESC NULLS LAST, pi.id DESC NULLS LAST, di.id DESC) AS rn
  FROM public.document_instances di
    LEFT JOIN public.stage_instances si ON si.id = di.stageinstance_id
    LEFT JOIN public.package_instances pi ON pi.id = si.packageinstance_id AND pi.membership_state = 'active'::text
    LEFT JOIN public.packages p ON p.id = pi.package_id
  WHERE si.id IS NULL OR pi.id IS NOT NULL
)
SELECT r.id,
  r.tenant_id,
  r.document_id,
  r.generationdate,
  r.generated_file_url,
  r.status,
  r.document_title,
  d.title AS doc_title,
  d.description,
  d.category,
  d.framework_type,
  r.package_name AS active_package_names
FROM ranked r
  JOIN public.documents d ON d.id = r.document_id
WHERE r.rn = 1;