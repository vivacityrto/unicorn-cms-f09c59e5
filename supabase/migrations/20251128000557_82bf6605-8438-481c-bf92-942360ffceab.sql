-- Add RLS policy for emails table to allow Super Admins to manage all emails
CREATE POLICY "Super admins can manage emails"
ON public.emails
FOR ALL
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());