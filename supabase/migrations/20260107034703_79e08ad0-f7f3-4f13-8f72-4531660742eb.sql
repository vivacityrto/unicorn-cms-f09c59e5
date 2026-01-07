-- Phase 8: Stage Releases and Enhanced Document Generation

-- Table: stage_releases - tracks release snapshots
CREATE TABLE public.stage_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  package_id integer REFERENCES public.packages(id) ON DELETE SET NULL,
  stage_id integer NOT NULL REFERENCES public.documents_stages(id) ON DELETE CASCADE,
  release_type text NOT NULL DEFAULT 'documents' CHECK (release_type IN ('documents', 'pack')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'released', 'cancelled')),
  summary text,
  pack_download_url text,
  email_sent_at timestamptz,
  email_template_id uuid REFERENCES public.email_templates(id),
  released_at timestamptz,
  released_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Table: stage_release_items - documents in a release
CREATE TABLE public.stage_release_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_release_id uuid NOT NULL REFERENCES public.stage_releases(id) ON DELETE CASCADE,
  document_id integer NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  document_version_id uuid REFERENCES public.document_versions(id),
  generated_document_id uuid REFERENCES public.generated_documents(id),
  is_visible_to_tenant boolean NOT NULL DEFAULT true,
  include_in_pack boolean NOT NULL DEFAULT true,
  generation_status text DEFAULT 'pending' CHECK (generation_status IN ('pending', 'running', 'success', 'failed', 'skipped')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add document_version_id to generated_documents if not exists
ALTER TABLE public.generated_documents 
ADD COLUMN IF NOT EXISTS document_version_id uuid REFERENCES public.document_versions(id);

-- Add generation_status column with proper check constraint to generated_documents
ALTER TABLE public.generated_documents 
DROP CONSTRAINT IF EXISTS generated_documents_status_check;

ALTER TABLE public.generated_documents 
ADD CONSTRAINT generated_documents_status_check 
CHECK (status IN ('pending', 'running', 'success', 'failed', 'generated', 'released', 'superseded'));

-- Add stage_release_id to email_send_log for tracking release emails
ALTER TABLE public.email_send_log 
ADD COLUMN IF NOT EXISTS stage_release_id uuid REFERENCES public.stage_releases(id);

-- Indexes for stage_releases
CREATE INDEX IF NOT EXISTS idx_stage_releases_tenant ON public.stage_releases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stage_releases_stage ON public.stage_releases(stage_id);
CREATE INDEX IF NOT EXISTS idx_stage_releases_package ON public.stage_releases(package_id);
CREATE INDEX IF NOT EXISTS idx_stage_releases_status ON public.stage_releases(status);

-- Indexes for stage_release_items
CREATE INDEX IF NOT EXISTS idx_stage_release_items_release ON public.stage_release_items(stage_release_id);
CREATE INDEX IF NOT EXISTS idx_stage_release_items_document ON public.stage_release_items(document_id);
CREATE INDEX IF NOT EXISTS idx_stage_release_items_generated ON public.stage_release_items(generated_document_id);

-- RLS for stage_releases
ALTER TABLE public.stage_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view releases for their tenants" 
ON public.stage_releases FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.user_uuid = auth.uid() 
    AND (u.tenant_id = stage_releases.tenant_id OR u.unicorn_role IN ('Super Admin', 'Admin'))
  )
);

CREATE POLICY "Admins can create releases" 
ON public.stage_releases FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.user_uuid = auth.uid() 
    AND u.unicorn_role IN ('Super Admin', 'Admin')
  )
);

CREATE POLICY "Admins can update releases" 
ON public.stage_releases FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.user_uuid = auth.uid() 
    AND u.unicorn_role IN ('Super Admin', 'Admin')
  )
);

-- RLS for stage_release_items
ALTER TABLE public.stage_release_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view release items for their releases" 
ON public.stage_release_items FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.stage_releases sr
    JOIN public.users u ON u.user_uuid = auth.uid()
    WHERE sr.id = stage_release_items.stage_release_id
    AND (u.tenant_id = sr.tenant_id OR u.unicorn_role IN ('Super Admin', 'Admin'))
  )
);

CREATE POLICY "Admins can manage release items" 
ON public.stage_release_items FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.user_uuid = auth.uid() 
    AND u.unicorn_role IN ('Super Admin', 'Admin')
  )
);