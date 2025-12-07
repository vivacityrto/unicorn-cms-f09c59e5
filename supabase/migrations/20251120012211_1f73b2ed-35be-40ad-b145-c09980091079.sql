-- Fix foreign key constraints to allow user deletion

-- 1. Fix profiles table constraint (auth_user_id -> auth.users.id)
ALTER TABLE public.profiles 
DROP CONSTRAINT IF EXISTS profiles_auth_user_fk;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_auth_user_fk 
FOREIGN KEY (auth_user_id) 
REFERENCES auth.users(id) 
ON DELETE CASCADE;

-- 2. Fix user_invitations table constraint (invited_by -> auth.users.id)
ALTER TABLE public.user_invitations 
DROP CONSTRAINT IF EXISTS user_invitations_invited_by_fkey;

ALTER TABLE public.user_invitations
ADD CONSTRAINT user_invitations_invited_by_fkey 
FOREIGN KEY (invited_by) 
REFERENCES auth.users(id) 
ON DELETE SET NULL;

-- 3. Fix tasks_tenants.assigned_to constraint
ALTER TABLE public.tasks_tenants
DROP CONSTRAINT IF EXISTS tasks_tenants_assigned_to_fkey;

ALTER TABLE public.tasks_tenants
ADD CONSTRAINT tasks_tenants_assigned_to_fkey
FOREIGN KEY (assigned_to)
REFERENCES auth.users(id)
ON DELETE SET NULL;

-- 4. Fix tasks_tenants.created_by constraint  
-- First check if there's an existing constraint to users table
DO $$
BEGIN
    -- Drop any existing constraint
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name LIKE '%tasks_tenants%created_by%' 
        AND table_name = 'tasks_tenants'
    ) THEN
        ALTER TABLE public.tasks_tenants DROP CONSTRAINT IF EXISTS tasks_tenants_created_by_fkey;
    END IF;
END $$;

ALTER TABLE public.tasks_tenants
ADD CONSTRAINT tasks_tenants_created_by_fkey
FOREIGN KEY (created_by)
REFERENCES auth.users(id)
ON DELETE SET NULL;

COMMENT ON CONSTRAINT profiles_auth_user_fk ON public.profiles IS 'Cascade delete profiles when auth user is deleted';
COMMENT ON CONSTRAINT user_invitations_invited_by_fkey ON public.user_invitations IS 'Set invited_by to NULL when inviter is deleted to preserve invitation history';
COMMENT ON CONSTRAINT tasks_tenants_assigned_to_fkey ON public.tasks_tenants IS 'Set assigned_to to NULL when user is deleted';
COMMENT ON CONSTRAINT tasks_tenants_created_by_fkey ON public.tasks_tenants IS 'Set created_by to NULL when user is deleted';