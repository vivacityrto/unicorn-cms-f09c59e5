-- Create package_documents table
CREATE TABLE IF NOT EXISTS public.package_documents (
  id BIGSERIAL PRIMARY KEY,
  package_id BIGINT NOT NULL,
  stage_id BIGINT NOT NULL,
  document_name TEXT NOT NULL,
  description TEXT,
  file_type TEXT,
  is_client_doc BOOLEAN DEFAULT false,
  due_date_offset INTEGER,
  order_number INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.package_documents ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Super Admins can manage all package documents"
ON public.package_documents
FOR ALL
USING (is_super_admin())
WITH CHECK (is_super_admin());

CREATE POLICY "Users can view package documents"
ON public.package_documents
FOR SELECT
USING (true);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_package_documents_package_id ON public.package_documents(package_id);
CREATE INDEX IF NOT EXISTS idx_package_documents_stage_id ON public.package_documents(stage_id);