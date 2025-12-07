-- Change category column from integer to text in documents table to store comma-separated category IDs
-- First, convert existing integer values to text
ALTER TABLE public.documents 
ALTER COLUMN category TYPE text USING category::text;

-- Change category column from integer to text in documents_tenants table
ALTER TABLE public.documents_tenants 
ALTER COLUMN category TYPE text USING category::text;

-- Add comment to document the format
COMMENT ON COLUMN public.documents.category IS 'Comma-separated list of category IDs (e.g., "1,3,5")';
COMMENT ON COLUMN public.documents_tenants.category IS 'Comma-separated list of category IDs (e.g., "1,3,5")';