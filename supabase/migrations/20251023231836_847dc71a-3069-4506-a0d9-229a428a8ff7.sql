-- Drop the existing ALL policy on packages and create specific ones
DROP POLICY IF EXISTS "Authorized users can manage packages" ON public.packages;

-- Allow Super Admins and Team Leaders to insert packages
CREATE POLICY "Super Admins can insert packages"
ON public.packages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = auth.uid()
    AND unicorn_role IN ('Super Admin', 'Team Leader')
  )
);

-- Allow Super Admins and Team Leaders to update packages
CREATE POLICY "Super Admins can update packages"
ON public.packages
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = auth.uid()
    AND unicorn_role IN ('Super Admin', 'Team Leader')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = auth.uid()
    AND unicorn_role IN ('Super Admin', 'Team Leader')
  )
);

-- Allow Super Admins and Team Leaders to delete packages
CREATE POLICY "Super Admins can delete packages"
ON public.packages
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = auth.uid()
    AND unicorn_role IN ('Super Admin', 'Team Leader')
  )
);