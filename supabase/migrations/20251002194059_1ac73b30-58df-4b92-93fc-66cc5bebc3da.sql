-- Drop existing problematic policy
DROP POLICY IF EXISTS "Super Admins can read all profiles" ON public.users;

-- Create security definer function to check if current user is Super Admin
CREATE OR REPLACE FUNCTION public.is_current_user_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE user_uuid = auth.uid()
    AND unicorn_role = 'Super Admin'
  )
$$;

-- Create policy for Super Admins using the security definer function
CREATE POLICY "Super Admins can read all profiles"
ON public.users
FOR SELECT
TO authenticated
USING (is_current_user_super_admin());