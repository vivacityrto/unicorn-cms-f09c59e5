-- Add created_by column to documents table
ALTER TABLE public.documents
ADD COLUMN created_by uuid REFERENCES auth.users(id);

-- Add index for better query performance
CREATE INDEX idx_documents_created_by ON public.documents(created_by);