-- Fix user deletion by cleaning up orphaned records and updating constraint

-- Step 1: Remove orphaned tenant_members records (where user doesn't exist in users table)
DELETE FROM public.tenant_members
WHERE user_id NOT IN (SELECT user_uuid FROM public.users);

-- Step 2: Drop the existing constraint that's blocking deletions
ALTER TABLE public.tenant_members 
DROP CONSTRAINT IF EXISTS tenant_members_user_fk;

-- Step 3: Re-add the constraint with CASCADE deletion
ALTER TABLE public.tenant_members 
ADD CONSTRAINT tenant_members_user_fk 
FOREIGN KEY (user_id) 
REFERENCES public.users(user_uuid) 
ON DELETE CASCADE;