-- Migrate data from document_generation_fields to documents_fields
-- Insert records from document_generation_fields into documents_fields if not exists
INSERT INTO public.documents_fields (label, type, created_at, updated_at)
SELECT 
  name as label,
  'text' as type,
  now() as created_at,
  now() as updated_at
FROM public.document_generation_fields
WHERE NOT EXISTS (
  SELECT 1 FROM public.documents_fields df 
  WHERE df.label = document_generation_fields.name
);