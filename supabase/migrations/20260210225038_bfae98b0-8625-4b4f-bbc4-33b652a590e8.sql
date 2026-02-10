
-- ═══════════════════════════════════════════════════════════
-- SharePoint Folder Templates & Seed Infrastructure
-- ═══════════════════════════════════════════════════════════

-- 1. Folder templates (defines subfolder structure and seed rules)
CREATE TABLE public.sharepoint_folder_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  base_subfolders jsonb NOT NULL DEFAULT '[]'::jsonb,
  seed_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sharepoint_folder_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vivacity team can manage folder templates"
  ON public.sharepoint_folder_templates FOR ALL
  USING (is_vivacity_internal_safe(auth.uid()))
  WITH CHECK (is_vivacity_internal_safe(auth.uid()));

-- 2. Shared source folders (Vivacity's existing SharePoint folders to link/copy from)
CREATE TABLE public.sharepoint_shared_sources (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label text NOT NULL,
  site_id text,
  drive_id text,
  item_id text,
  web_url text NOT NULL,
  content_mode text NOT NULL DEFAULT 'link',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_content_mode CHECK (content_mode IN ('link', 'copy'))
);

ALTER TABLE public.sharepoint_shared_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vivacity team can manage shared sources"
  ON public.sharepoint_shared_sources FOR ALL
  USING (is_vivacity_internal_safe(auth.uid()))
  WITH CHECK (is_vivacity_internal_safe(auth.uid()));

-- 3. Reference links per tenant (links to shared Vivacity resources)
CREATE TABLE public.tenant_sharepoint_reference_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  label text NOT NULL,
  web_url text NOT NULL,
  source_shared_id uuid REFERENCES public.sharepoint_shared_sources(id),
  visibility text NOT NULL DEFAULT 'client',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_ref_visibility CHECK (visibility IN ('client', 'internal'))
);

ALTER TABLE public.tenant_sharepoint_reference_links ENABLE ROW LEVEL SECURITY;

-- Vivacity can manage all
CREATE POLICY "Vivacity team can manage reference links"
  ON public.tenant_sharepoint_reference_links FOR ALL
  USING (is_vivacity_internal_safe(auth.uid()))
  WITH CHECK (is_vivacity_internal_safe(auth.uid()));

-- Clients can read their own client-visible links
CREATE POLICY "Clients can read their reference links"
  ON public.tenant_sharepoint_reference_links FOR SELECT
  USING (
    has_tenant_access_safe(tenant_id, auth.uid())
    AND visibility = 'client'
  );

-- 4. Seed run log (tracks idempotent seeding per tenant per template version)
CREATE TABLE public.tenant_sharepoint_seed_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id),
  template_id uuid REFERENCES public.sharepoint_folder_templates(id),
  template_version text NOT NULL DEFAULT 'v1',
  status text NOT NULL DEFAULT 'pending',
  subfolders_created integer NOT NULL DEFAULT 0,
  files_copied integer NOT NULL DEFAULT 0,
  links_created integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by uuid,
  CONSTRAINT chk_seed_status CHECK (status IN ('pending', 'running', 'success', 'failed')),
  CONSTRAINT uq_seed_run UNIQUE (tenant_id, template_version)
);

ALTER TABLE public.tenant_sharepoint_seed_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vivacity team can manage seed runs"
  ON public.tenant_sharepoint_seed_runs FOR ALL
  USING (is_vivacity_internal_safe(auth.uid()))
  WITH CHECK (is_vivacity_internal_safe(auth.uid()));

-- 5. Add template_id to tenant_sharepoint_settings for tracking which template was used
ALTER TABLE public.tenant_sharepoint_settings
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.sharepoint_folder_templates(id);
