-- Update existing emails to set Ian Baterna as the creator
UPDATE public.emails 
SET created_by = '384cf51f-87f5-479b-a9c4-a2293be84e3a'
WHERE created_by IS NULL;