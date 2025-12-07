-- Create documents_stages table
CREATE TABLE public.documents_stages (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name text NOT NULL,
  short_name text,
  description text,
  video_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on documents_stages
ALTER TABLE public.documents_stages ENABLE ROW LEVEL SECURITY;

-- RLS policies for documents_stages
CREATE POLICY "Super Admins can view all stages"
ON public.documents_stages
FOR SELECT
USING (is_super_admin());

CREATE POLICY "Super Admins can insert stages"
ON public.documents_stages
FOR INSERT
WITH CHECK (is_super_admin());

CREATE POLICY "Super Admins can update stages"
ON public.documents_stages
FOR UPDATE
USING (is_super_admin())
WITH CHECK (is_super_admin());

CREATE POLICY "Super Admins can delete stages"
ON public.documents_stages
FOR DELETE
USING (is_super_admin());

-- Create document_instances table
CREATE TABLE public.document_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id bigint REFERENCES public.documents(id) ON DELETE CASCADE,
  tenant_id bigint REFERENCES public.tenants(id) ON DELETE CASCADE,
  status text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on document_instances
ALTER TABLE public.document_instances ENABLE ROW LEVEL SECURITY;

-- RLS policies for document_instances
CREATE POLICY "Super Admins can manage all document instances"
ON public.document_instances
FOR ALL
USING (is_super_admin())
WITH CHECK (is_super_admin());

CREATE POLICY "Users can view their tenant document instances"
ON public.document_instances
FOR SELECT
USING (tenant_id = get_current_user_tenant());

-- Add trigger for updated_at on documents_stages
CREATE TRIGGER update_documents_stages_updated_at
BEFORE UPDATE ON public.documents_stages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add trigger for updated_at on document_instances
CREATE TRIGGER update_document_instances_updated_at
BEFORE UPDATE ON public.document_instances
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();