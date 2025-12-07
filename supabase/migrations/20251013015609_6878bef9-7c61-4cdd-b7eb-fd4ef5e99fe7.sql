-- Update existing users to have correct user_type based on unicorn_role
UPDATE public.users
SET user_type = CASE
  WHEN unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member') THEN 'Vivacity'
  WHEN unicorn_role = 'Admin' THEN 'Client'
  WHEN unicorn_role = 'User' THEN 'Client'
  ELSE user_type
END
WHERE user_type IS NULL 
   OR (unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member') AND user_type != 'Vivacity')
   OR (unicorn_role IN ('Admin', 'User') AND user_type != 'Client');