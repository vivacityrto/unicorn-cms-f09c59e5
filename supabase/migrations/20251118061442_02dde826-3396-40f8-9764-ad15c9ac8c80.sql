-- Drop the existing foreign key constraint
ALTER TABLE public.documents_categories 
DROP CONSTRAINT IF EXISTS documents_categories_created_by_fkey;

-- Add the correct foreign key to the users table
ALTER TABLE public.documents_categories 
ADD CONSTRAINT documents_categories_created_by_fkey 
FOREIGN KEY (created_by) 
REFERENCES public.users(user_uuid) 
ON DELETE SET NULL;