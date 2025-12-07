-- Create security definer function to check super admin role from users table
CREATE OR REPLACE FUNCTION public.is_super_admin_by_role()
RETURNS boolean
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

-- Drop old policies on packages table
DROP POLICY IF EXISTS "Super admins can manage all packages" ON public.packages;
DROP POLICY IF EXISTS "Authenticated users can view packages" ON public.packages;

-- Create new policies using users.unicorn_role
CREATE POLICY "Super admins can manage all packages"
ON public.packages
FOR ALL
TO authenticated
USING (public.is_super_admin_by_role())
WITH CHECK (public.is_super_admin_by_role());

CREATE POLICY "Authenticated users can view packages"
ON public.packages
FOR SELECT
TO authenticated
USING (true);