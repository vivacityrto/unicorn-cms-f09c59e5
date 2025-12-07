-- Add RLS policy to allow Super Admins to update any user profile
CREATE POLICY "Super Admins can update all profiles"
ON public.users
FOR UPDATE
USING (is_current_user_super_admin())
WITH CHECK (is_current_user_super_admin());