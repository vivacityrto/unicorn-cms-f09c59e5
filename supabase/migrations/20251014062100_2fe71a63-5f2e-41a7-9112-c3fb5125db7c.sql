-- Step 1: Add a temporary column for the new role format
ALTER TABLE public.user_invitations 
ADD COLUMN unicorn_role TEXT;

-- Step 2: Migrate existing data to the new format
UPDATE public.user_invitations
SET unicorn_role = CASE
  WHEN role = 'SUPER_ADMIN_ADMINISTRATOR' THEN 'Super Admin'
  WHEN role = 'SUPER_ADMIN_TEAM_LEADER' THEN 'Team Leader'
  WHEN role = 'SUPER_ADMIN_GENERAL' THEN 'Team Member'
  WHEN role = 'CLIENT_ADMIN' THEN 'Admin'
  WHEN role = 'CLIENT_USER' THEN 'User'
  ELSE 'User' -- Default fallback
END;

-- Step 3: Drop the old role column
ALTER TABLE public.user_invitations 
DROP COLUMN role;

-- Step 4: Make unicorn_role NOT NULL
ALTER TABLE public.user_invitations
ALTER COLUMN unicorn_role SET NOT NULL;

-- Step 5: Add check constraint
ALTER TABLE public.user_invitations
ADD CONSTRAINT user_invitations_unicorn_role_check 
CHECK (unicorn_role IN (
  'Super Admin',
  'Team Leader',
  'Team Member',
  'Admin',
  'User'
));

COMMENT ON CONSTRAINT user_invitations_unicorn_role_check ON public.user_invitations IS 'Validates that unicorn_role matches the values from the unicorn_role enum used in the users table';