-- Add document_id column to audit_inspection table
ALTER TABLE public.audit_inspection 
ADD COLUMN document_id bigint REFERENCES public.documents(id) ON DELETE SET NULL;

-- Add index for better performance
CREATE INDEX idx_audit_inspection_document_id ON public.audit_inspection(document_id);