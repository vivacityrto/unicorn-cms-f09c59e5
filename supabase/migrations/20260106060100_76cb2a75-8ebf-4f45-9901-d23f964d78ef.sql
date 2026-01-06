-- Fix Jomar's user data to correct SuperAdmin - General role
UPDATE public.users 
SET 
  unicorn_role = 'Team Member',
  user_type = 'Vivacity Team',
  superadmin_level = 'General',
  tenant_id = NULL
WHERE user_uuid = '3cafeb73-148b-44d1-8b80-3bd395cb48f6';