-- Fix packages policy to use public instead of authenticated
DROP POLICY IF EXISTS "Admins and Team Leaders can manage packages" ON public.packages;

CREATE POLICY "Admins and Team Leaders can manage packages"
ON public.packages
FOR ALL
TO public
USING (can_manage_packages())
WITH CHECK (can_manage_packages());