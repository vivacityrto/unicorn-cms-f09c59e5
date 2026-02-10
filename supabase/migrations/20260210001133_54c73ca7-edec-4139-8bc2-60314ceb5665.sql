
-- Create tenant_documents table for client portal document exchange
CREATE TABLE IF NOT EXISTS public.tenant_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  uploaded_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  uploaded_by_role text NOT NULL CHECK (uploaded_by_role IN ('client', 'vivacity')),
  title text NOT NULL,
  description text,
  category text,
  storage_path text NOT NULL,
  mime_type text,
  file_size bigint,
  source text NOT NULL CHECK (source IN ('shared_to_client', 'uploaded_by_client')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tenant_documents ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tenant_documents_tenant_id ON public.tenant_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_documents_source ON public.tenant_documents(tenant_id, source);

-- RLS: Select — user can see docs for their tenant
CREATE POLICY "tenant_documents_select"
ON public.tenant_documents
FOR SELECT TO authenticated
USING (
  public.has_tenant_access_safe(tenant_id, auth.uid())
);

-- RLS: Insert — client users insert for their tenant, vivacity staff for any accessible tenant
CREATE POLICY "tenant_documents_insert"
ON public.tenant_documents
FOR INSERT TO authenticated
WITH CHECK (
  public.has_tenant_access_safe(tenant_id, auth.uid())
  AND uploaded_by_user_id = auth.uid()
);

-- RLS: Update — only the uploader can update
CREATE POLICY "tenant_documents_update"
ON public.tenant_documents
FOR UPDATE TO authenticated
USING (uploaded_by_user_id = auth.uid())
WITH CHECK (uploaded_by_user_id = auth.uid());

-- RLS: Delete — only the uploader can delete
CREATE POLICY "tenant_documents_delete"
ON public.tenant_documents
FOR DELETE TO authenticated
USING (uploaded_by_user_id = auth.uid());

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_tenant_documents_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_tenant_documents_updated_at
  BEFORE UPDATE ON public.tenant_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_tenant_documents_updated_at();
