-- Drop the old check constraint that's causing issues
ALTER TABLE public.user_invitations 
DROP CONSTRAINT IF EXISTS user_invitations_role_check;

-- Add a new check constraint that allows the roles used by the invite-user edge function
-- These match the roles defined in the edge function
ALTER TABLE public.user_invitations
ADD CONSTRAINT user_invitations_role_check 
CHECK (role IN (
  'SUPER_ADMIN_ADMINISTRATOR',
  'SUPER_ADMIN_TEAM_LEADER', 
  'SUPER_ADMIN_GENERAL',
  'CLIENT_ADMIN',
  'CLIENT_USER'
));

-- Add comment explaining the constraint
COMMENT ON CONSTRAINT user_invitations_role_check ON public.user_invitations IS 'Validates that role matches one of the predefined invitation roles used by the invite-user edge function';