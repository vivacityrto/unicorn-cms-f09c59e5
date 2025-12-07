-- Ensure the packages policy has complete WITH CHECK expression
DROP POLICY IF EXISTS "Super admins can manage all packages" ON public.packages;

CREATE POLICY "Super admins can manage all packages"
ON public.packages
FOR ALL
TO authenticated
USING (public.is_super_admin_by_role())
WITH CHECK (public.is_super_admin_by_role());