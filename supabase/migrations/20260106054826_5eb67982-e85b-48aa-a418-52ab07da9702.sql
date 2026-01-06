-- Add superadmin_level column to users table
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS superadmin_level text 
CHECK (superadmin_level IN ('Administrator', 'Team Leader', 'General'));

-- Set Administrator level for primary admin accounts
UPDATE public.users 
SET superadmin_level = 'Administrator'
WHERE unicorn_role = 'Super Admin' 
  AND email IN ('angela@vivacity.com.au', 'admin@vivacity.com.au');

-- Set General level for remaining SuperAdmin users
UPDATE public.users 
SET superadmin_level = 'General'
WHERE unicorn_role = 'Super Admin' 
  AND superadmin_level IS NULL;