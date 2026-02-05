
-- Fix: Update processes.owner_user_id foreign key to reference public.users(user_uuid)
-- This allows selecting any user from the users table, not just auth.users

-- Drop the existing constraint
ALTER TABLE public.processes 
DROP CONSTRAINT IF EXISTS processes_owner_user_id_fkey;

-- Add the new constraint referencing public.users
ALTER TABLE public.processes 
ADD CONSTRAINT processes_owner_user_id_fkey 
FOREIGN KEY (owner_user_id) REFERENCES public.users(user_uuid);
