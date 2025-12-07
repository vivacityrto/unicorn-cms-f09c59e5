-- Drop the existing policy with the correct name
DROP POLICY "Super Admins and Team Leaders can manage packages" ON public.packages;

-- Create a security definer function to check if user can manage packages
CREATE OR REPLACE FUNCTION public.can_manage_packages()
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
      AND unicorn_role IN ('Super Admin', 'Team Leader')
  );
$$;

-- Create policy using the function
CREATE POLICY "Authorized users can manage packages"
ON public.packages
FOR ALL
TO authenticated
USING (public.can_manage_packages())
WITH CHECK (public.can_manage_packages());