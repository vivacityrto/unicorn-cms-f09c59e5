-- Create package_stage_documents join table
CREATE TABLE public.package_stage_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id BIGINT NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  stage_id INTEGER NOT NULL REFERENCES public.documents_stages(id) ON DELETE CASCADE,
  document_id BIGINT NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  visibility TEXT NOT NULL DEFAULT 'both' CHECK (visibility IN ('team_only', 'tenant_download', 'both')),
  delivery_type TEXT NOT NULL DEFAULT 'manual' CHECK (delivery_type IN ('manual', 'auto_generate')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- Prevent duplicate document in same stage
  CONSTRAINT unique_package_stage_document UNIQUE (package_id, stage_id, document_id)
);

-- Create indexes for performance
CREATE INDEX idx_package_stage_documents_package_id ON public.package_stage_documents(package_id);
CREATE INDEX idx_package_stage_documents_stage_id ON public.package_stage_documents(stage_id);
CREATE INDEX idx_package_stage_documents_document_id ON public.package_stage_documents(document_id);

-- Enable RLS
ALTER TABLE public.package_stage_documents ENABLE ROW LEVEL SECURITY;

-- SuperAdmin only policies
CREATE POLICY "SuperAdmin can view package_stage_documents"
ON public.package_stage_documents
FOR SELECT
TO authenticated
USING (public.is_superadmin());

CREATE POLICY "SuperAdmin can insert package_stage_documents"
ON public.package_stage_documents
FOR INSERT
TO authenticated
WITH CHECK (public.is_superadmin());

CREATE POLICY "SuperAdmin can update package_stage_documents"
ON public.package_stage_documents
FOR UPDATE
TO authenticated
USING (public.is_superadmin());

CREATE POLICY "SuperAdmin can delete package_stage_documents"
ON public.package_stage_documents
FOR DELETE
TO authenticated
USING (public.is_superadmin());

-- Create trigger for updated_at
CREATE TRIGGER update_package_stage_documents_updated_at
BEFORE UPDATE ON public.package_stage_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();