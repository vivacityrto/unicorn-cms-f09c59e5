-- Add created_by column to documents_categories table
ALTER TABLE public.documents_categories 
ADD COLUMN created_by UUID REFERENCES auth.users(id);

-- Set default creator for existing records to Ian
UPDATE public.documents_categories 
SET created_by = '384cf51f-87f5-479b-a9c4-a2293be84e3a'
WHERE created_by IS NULL;

-- Set default for future inserts
ALTER TABLE public.documents_categories 
ALTER COLUMN created_by SET DEFAULT auth.uid();