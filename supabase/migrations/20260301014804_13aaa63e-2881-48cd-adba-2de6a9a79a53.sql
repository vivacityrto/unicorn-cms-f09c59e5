-- Seed the Master Documents SharePoint site
INSERT INTO public.sharepoint_sites (site_name, site_url, purpose, is_active)
VALUES (
  'Master Documents',
  'https://vivacityrtocoaching.sharepoint.com/sites/MasterDocuments',
  'master_documents',
  true
)
ON CONFLICT DO NOTHING;