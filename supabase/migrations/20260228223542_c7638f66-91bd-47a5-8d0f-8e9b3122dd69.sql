
-- ============================================================
-- Stage 1: SharePoint Site Registry & Folder Resolution
-- ============================================================

-- 1. Create sharepoint_sites registry table
CREATE TABLE IF NOT EXISTS public.sharepoint_sites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_name text NOT NULL,
  site_url text NOT NULL,
  graph_site_id text,
  drive_id text,
  purpose text NOT NULL DEFAULT 'client_files'
    CHECK (purpose IN ('master_documents', 'client_files')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sharepoint_sites IS 'Registry of SharePoint sites used by Unicorn (Master Documents vs Client Files)';

ALTER TABLE public.sharepoint_sites ENABLE ROW LEVEL SECURITY;

-- RLS: Vivacity staff only
CREATE POLICY "sharepoint_sites_select_staff"
  ON public.sharepoint_sites FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_uuid = auth.uid()
        AND users.is_vivacity_internal = true
    )
  );

CREATE POLICY "sharepoint_sites_insert_staff"
  ON public.sharepoint_sites FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_uuid = auth.uid()
        AND users.is_vivacity_internal = true
    )
  );

CREATE POLICY "sharepoint_sites_update_staff"
  ON public.sharepoint_sites FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_uuid = auth.uid()
        AND users.is_vivacity_internal = true
    )
  );

-- 2. Add columns to dd_document_categories
ALTER TABLE public.dd_document_categories
  ADD COLUMN IF NOT EXISTS sharepoint_folder_name text,
  ADD COLUMN IF NOT EXISTS sort_order integer,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 3. Add folder-resolution columns to tenant_sharepoint_settings
ALTER TABLE public.tenant_sharepoint_settings
  ADD COLUMN IF NOT EXISTS compliance_docs_folder_item_id text,
  ADD COLUMN IF NOT EXISTS compliance_docs_folder_name text,
  ADD COLUMN IF NOT EXISTS match_method text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- Add FK for verified_by
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'tenant_sharepoint_settings_verified_by_fkey'
  ) THEN
    ALTER TABLE public.tenant_sharepoint_settings
      ADD CONSTRAINT tenant_sharepoint_settings_verified_by_fkey
      FOREIGN KEY (verified_by) REFERENCES public.users(user_uuid);
  END IF;
END $$;

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_sharepoint_sites_purpose
  ON public.sharepoint_sites (purpose) WHERE is_active = true;

-- Trigger for updated_at on sharepoint_sites
CREATE OR REPLACE FUNCTION public.update_sharepoint_sites_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_sharepoint_sites_updated_at ON public.sharepoint_sites;
CREATE TRIGGER trg_sharepoint_sites_updated_at
  BEFORE UPDATE ON public.sharepoint_sites
  FOR EACH ROW
  EXECUTE FUNCTION public.update_sharepoint_sites_updated_at();
