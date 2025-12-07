-- Create document_files table
CREATE TABLE public.document_files (
  id BIGSERIAL PRIMARY KEY,
  file_path TEXT NOT NULL,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.document_files ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Super Admins can manage all document files"
  ON public.document_files
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

CREATE POLICY "Users can view document files they uploaded"
  ON public.document_files
  FOR SELECT
  USING (uploaded_by = auth.uid());

CREATE POLICY "Users can insert their own document files"
  ON public.document_files
  FOR INSERT
  WITH CHECK (uploaded_by = auth.uid());

-- Add trigger for updated_at
CREATE TRIGGER update_document_files_updated_at
  BEFORE UPDATE ON public.document_files
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add index on uploaded_by for faster queries
CREATE INDEX idx_document_files_uploaded_by ON public.document_files(uploaded_by);

-- Add index on file_path for faster lookups
CREATE INDEX idx_document_files_path ON public.document_files(file_path);