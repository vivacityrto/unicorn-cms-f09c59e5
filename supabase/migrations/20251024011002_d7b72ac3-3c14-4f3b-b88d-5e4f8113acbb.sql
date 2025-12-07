-- Fix packages policy to allow Team Leaders and Super Admins
DROP POLICY IF EXISTS "Super admins can manage all packages" ON public.packages;

CREATE POLICY "Admins and Team Leaders can manage packages"
ON public.packages
FOR ALL
TO authenticated
USING (can_manage_packages())
WITH CHECK (can_manage_packages());