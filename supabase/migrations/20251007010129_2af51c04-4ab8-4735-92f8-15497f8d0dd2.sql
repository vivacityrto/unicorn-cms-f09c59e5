-- Remove redundant document_id column from documents_tenants
-- The id column is sufficient as the document identifier

ALTER TABLE public.documents_tenants 
DROP COLUMN IF EXISTS document_id;