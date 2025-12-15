-- Update all existing documents to set created_by to Ian's UUID
UPDATE public.documents 
SET created_by = '384cf51f-87f5-479b-a9c4-a2293be84e3a'
WHERE created_by IS NULL;