-- Add created_by column to documents_stages table
ALTER TABLE public.documents_stages 
ADD COLUMN created_by UUID REFERENCES public.users(user_uuid) ON DELETE SET NULL;

-- Set default creator for existing records to Ian
UPDATE public.documents_stages 
SET created_by = '384cf51f-87f5-479b-a9c4-a2293be84e3a'
WHERE created_by IS NULL;

-- Set default for future inserts
ALTER TABLE public.documents_stages 
ALTER COLUMN created_by SET DEFAULT auth.uid();

-- Add created_by column to documents_fields table
ALTER TABLE public.documents_fields 
ADD COLUMN created_by UUID REFERENCES public.users(user_uuid) ON DELETE SET NULL;

-- Set default creator for existing records to Ian
UPDATE public.documents_fields 
SET created_by = '384cf51f-87f5-479b-a9c4-a2293be84e3a'
WHERE created_by IS NULL;

-- Set default for future inserts
ALTER TABLE public.documents_fields 
ALTER COLUMN created_by SET DEFAULT auth.uid();