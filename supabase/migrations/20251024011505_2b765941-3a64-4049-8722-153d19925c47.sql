-- Simplify packages policy to allow any authenticated user to add packages
DROP POLICY IF EXISTS "Admins and Team Leaders can manage packages" ON public.packages;

CREATE POLICY "Authenticated users can add packages"
ON public.packages
FOR INSERT
TO public
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage existing packages"
ON public.packages
FOR ALL
TO public
USING (can_manage_packages())
WITH CHECK (can_manage_packages());