-- Phase 13: Backfill stage templates from existing package content
-- For each stage, copy content from the "best" package (certified first, then most recently created)

-- Backfill stage_team_tasks
INSERT INTO public.stage_team_tasks (stage_id, name, description, sort_order, owner_role, estimated_hours, is_mandatory)
SELECT DISTINCT ON (ps.stage_id, pst.order_number)
  ps.stage_id,
  pst.name,
  pst.description,
  pst.order_number,
  COALESCE(pst.owner_role, 'Admin'),
  pst.estimated_hours,
  COALESCE(pst.is_mandatory, true)
FROM public.package_staff_tasks pst
JOIN public.package_stages ps ON ps.package_id = pst.package_id AND ps.stage_id = pst.stage_id
JOIN public.documents_stages ds ON ds.id = ps.stage_id
LEFT JOIN public.packages pkg ON pkg.id = ps.package_id
ORDER BY ps.stage_id, pst.order_number, ds.is_certified DESC NULLS LAST, pkg.created_at DESC NULLS LAST
ON CONFLICT DO NOTHING;

-- Backfill stage_client_tasks
INSERT INTO public.stage_client_tasks (stage_id, name, description, sort_order, instructions, required_documents, due_date_offset)
SELECT DISTINCT ON (ps.stage_id, pct.order_number)
  ps.stage_id,
  pct.name,
  pct.description,
  pct.order_number,
  pct.instructions,
  pct.required_documents,
  pct.due_date_offset
FROM public.package_client_tasks pct
JOIN public.package_stages ps ON ps.package_id = pct.package_id AND ps.stage_id = pct.stage_id
JOIN public.documents_stages ds ON ds.id = ps.stage_id
LEFT JOIN public.packages pkg ON pkg.id = ps.package_id
ORDER BY ps.stage_id, pct.order_number, ds.is_certified DESC NULLS LAST, pkg.created_at DESC NULLS LAST
ON CONFLICT DO NOTHING;

-- Backfill stage_emails
INSERT INTO public.stage_emails (stage_id, email_template_id, trigger_type, recipient_type, sort_order, is_active, created_by)
SELECT DISTINCT ON (ps.stage_id, pse.sort_order)
  ps.stage_id,
  pse.email_template_id,
  pse.trigger_type,
  pse.recipient_type,
  pse.sort_order,
  pse.is_active,
  pse.created_by
FROM public.package_stage_emails pse
JOIN public.package_stages ps ON ps.package_id = pse.package_id AND ps.stage_id = pse.stage_id
JOIN public.documents_stages ds ON ds.id = ps.stage_id
LEFT JOIN public.packages pkg ON pkg.id = ps.package_id
ORDER BY ps.stage_id, pse.sort_order, ds.is_certified DESC NULLS LAST, pkg.created_at DESC NULLS LAST
ON CONFLICT DO NOTHING;

-- Backfill stage_documents
INSERT INTO public.stage_documents (stage_id, document_id, sort_order, visibility, delivery_type, is_team_only, is_tenant_downloadable, is_auto_generated)
SELECT DISTINCT ON (ps.stage_id, psd.document_id)
  ps.stage_id,
  psd.document_id,
  psd.sort_order,
  COALESCE(psd.visibility, 'both'),
  COALESCE(psd.delivery_type, 'manual'),
  COALESCE(doc.is_team_only, false),
  COALESCE(doc.is_tenant_downloadable, true),
  COALESCE(doc.is_auto_generated, false)
FROM public.package_stage_documents psd
JOIN public.package_stages ps ON ps.package_id = psd.package_id AND ps.stage_id = psd.stage_id
JOIN public.documents_stages ds ON ds.id = ps.stage_id
LEFT JOIN public.documents doc ON doc.id = psd.document_id
LEFT JOIN public.packages pkg ON pkg.id = ps.package_id
ORDER BY ps.stage_id, psd.document_id, ds.is_certified DESC NULLS LAST, pkg.created_at DESC NULLS LAST
ON CONFLICT (stage_id, document_id) DO NOTHING;