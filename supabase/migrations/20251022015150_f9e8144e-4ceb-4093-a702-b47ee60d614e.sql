-- Allow Super Admins to insert and update packages
CREATE POLICY "Super Admins can manage packages"
ON public.packages
FOR ALL
TO public
USING (is_super_admin())
WITH CHECK (is_super_admin());