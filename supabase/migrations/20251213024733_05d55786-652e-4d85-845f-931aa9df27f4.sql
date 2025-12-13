-- Add document_id column to package_documents for linking to original documents
ALTER TABLE public.package_documents 
ADD COLUMN document_id bigint REFERENCES public.documents(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX idx_package_documents_document_id ON public.package_documents(document_id);

-- Add unique constraint to prevent duplicate links of same document to same package/stage
CREATE UNIQUE INDEX idx_package_documents_unique_link 
ON public.package_documents(package_id, stage_id, document_id) 
WHERE document_id IS NOT NULL;