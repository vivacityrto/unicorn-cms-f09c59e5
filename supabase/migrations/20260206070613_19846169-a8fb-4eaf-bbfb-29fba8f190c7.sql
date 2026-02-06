-- =============================================================================
-- SharePoint Document Linking Schema
-- =============================================================================

-- Create evidence type enum
CREATE TYPE public.evidence_type AS ENUM ('policy', 'procedure', 'record', 'form', 'template', 'other');

-- Create document_links table
CREATE TABLE public.document_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_uuid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'microsoft',
  drive_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  file_name TEXT,
  file_extension TEXT,
  mime_type TEXT,
  file_size BIGINT,
  web_url TEXT NOT NULL,
  version_id TEXT,
  current_version_id TEXT, -- For tracking version changes
  client_id INTEGER REFERENCES public.tenants(id) ON DELETE SET NULL,
  package_id INTEGER REFERENCES public.packages(id) ON DELETE SET NULL,
  process_id UUID, -- For future process linking
  task_id UUID, -- For task linking
  meeting_id UUID REFERENCES public.meetings(id) ON DELETE SET NULL,
  evidence_type public.evidence_type,
  notes TEXT,
  version_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Unique constraint to prevent duplicate links
  CONSTRAINT document_links_unique_item UNIQUE (provider, drive_id, item_id)
);

-- Create indexes for efficient queries
CREATE INDEX idx_document_links_tenant ON public.document_links(tenant_id);
CREATE INDEX idx_document_links_user ON public.document_links(user_uuid);
CREATE INDEX idx_document_links_client ON public.document_links(client_id);
CREATE INDEX idx_document_links_package ON public.document_links(package_id);
CREATE INDEX idx_document_links_meeting ON public.document_links(meeting_id);
CREATE INDEX idx_document_links_evidence_type ON public.document_links(evidence_type);

-- Enable RLS
ALTER TABLE public.document_links ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view documents linked to entities they can access
CREATE POLICY "document_links_select_policy" ON public.document_links
FOR SELECT TO authenticated
USING (
  -- Creator can always see their links
  user_uuid = auth.uid()
  OR
  -- SuperAdmin can see all
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid() AND u.role = 'SuperAdmin'
  )
  OR
  -- Staff can see links for clients they have access to
  (client_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = document_links.client_id
    AND tu.user_id = auth.uid()
  ))
);

-- Only authenticated users can insert their own links
CREATE POLICY "document_links_insert_policy" ON public.document_links
FOR INSERT TO authenticated
WITH CHECK (user_uuid = auth.uid());

-- Creator or SuperAdmin can update
CREATE POLICY "document_links_update_policy" ON public.document_links
FOR UPDATE TO authenticated
USING (
  user_uuid = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid() AND u.role = 'SuperAdmin'
  )
);

-- Only SuperAdmin can delete
CREATE POLICY "document_links_delete_policy" ON public.document_links
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid() AND u.role = 'SuperAdmin'
  )
);

-- Create audit table for document link events
CREATE TABLE public.document_link_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_link_id UUID REFERENCES public.document_links(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  user_uuid UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  linked_entity_type TEXT,
  linked_entity_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_document_link_audit_link ON public.document_link_audit(document_link_id);
CREATE INDEX idx_document_link_audit_user ON public.document_link_audit(user_uuid);
CREATE INDEX idx_document_link_audit_created ON public.document_link_audit(created_at);

-- Enable RLS on audit table
ALTER TABLE public.document_link_audit ENABLE ROW LEVEL SECURITY;

-- Audit is read-only for SuperAdmin
CREATE POLICY "document_link_audit_select_policy" ON public.document_link_audit
FOR SELECT TO authenticated
USING (
  user_uuid = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid() AND u.role = 'SuperAdmin'
  )
);

-- Service role inserts audit entries
CREATE POLICY "document_link_audit_insert_policy" ON public.document_link_audit
FOR INSERT TO authenticated
WITH CHECK (user_uuid = auth.uid());

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_document_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER document_links_updated_at_trigger
  BEFORE UPDATE ON public.document_links
  FOR EACH ROW
  EXECUTE FUNCTION public.update_document_links_updated_at();