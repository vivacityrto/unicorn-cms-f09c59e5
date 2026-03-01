
-- ============================================================
-- Stage 2 Migration: Governance Template Integrity & Folder Naming
-- ============================================================

-- 1. Add source_template_url to documents
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS source_template_url text;

-- 2. Add governance columns to document_versions
ALTER TABLE public.document_versions
  ADD COLUMN IF NOT EXISTS checksum_sha256 text,
  ADD COLUMN IF NOT EXISTS frozen_storage_path text,
  ADD COLUMN IF NOT EXISTS source_site_id text,
  ADD COLUMN IF NOT EXISTS source_drive_item_id text,
  ADD COLUMN IF NOT EXISTS source_path_display text,
  ADD COLUMN IF NOT EXISTS published_by uuid,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

-- 3. Add governance columns to tenant_sharepoint_settings
ALTER TABLE public.tenant_sharepoint_settings
  ADD COLUMN IF NOT EXISTS governance_site_id text,
  ADD COLUMN IF NOT EXISTS governance_drive_id text,
  ADD COLUMN IF NOT EXISTS governance_folder_item_id text,
  ADD COLUMN IF NOT EXISTS governance_folder_url text,
  ADD COLUMN IF NOT EXISTS governance_folder_name text;

-- 4. Create document_template_mappings table
CREATE TABLE IF NOT EXISTS public.document_template_mappings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_version_id uuid NOT NULL REFERENCES public.document_versions(id) ON DELETE CASCADE,
  mapping_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  checksum_sha256 text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

ALTER TABLE public.document_template_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vivacity staff can view template mappings"
  ON public.document_template_mappings FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE users.user_uuid = auth.uid() AND users.is_vivacity_internal = true));

CREATE POLICY "Vivacity staff can insert template mappings"
  ON public.document_template_mappings FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE users.user_uuid = auth.uid() AND users.is_vivacity_internal = true));

CREATE POLICY "Vivacity staff can update template mappings"
  ON public.document_template_mappings FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.users WHERE users.user_uuid = auth.uid() AND users.is_vivacity_internal = true));

CREATE POLICY "Vivacity staff can delete template mappings"
  ON public.document_template_mappings FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.users WHERE users.user_uuid = auth.uid() AND users.is_vivacity_internal = true));

-- 5. Normalise documents.format to lowercase
UPDATE public.documents
SET format = lower(format)
WHERE format IS NOT NULL AND format != lower(format);

-- 6. Seed v1 document_versions for documents without any version records
INSERT INTO public.document_versions (document_id, version_number, status, storage_path, file_name, created_at, created_by)
SELECT
  d.id, 1, 'published',
  COALESCE(d.uploaded_files[1], ''),
  COALESCE(d.file_names[1], d.title),
  COALESCE(d.createdat, now()),
  d.created_by
FROM public.documents d
LEFT JOIN public.document_versions dv ON dv.document_id = d.id
WHERE dv.id IS NULL;

-- 7. Update check constraint to allow governance_client_files
ALTER TABLE public.sharepoint_sites
  DROP CONSTRAINT IF EXISTS sharepoint_sites_purpose_check;

ALTER TABLE public.sharepoint_sites
  ADD CONSTRAINT sharepoint_sites_purpose_check
  CHECK (purpose = ANY (ARRAY['master_documents'::text, 'client_files'::text, 'governance_client_files'::text]));

-- 8. Seed the Governance site into sharepoint_sites
INSERT INTO public.sharepoint_sites (site_name, site_url, purpose, is_active)
VALUES (
  'Clients938 - Governance',
  'https://vivacitycoaching.sharepoint.com/sites/Clients938',
  'governance_client_files',
  true
)
ON CONFLICT DO NOTHING;
