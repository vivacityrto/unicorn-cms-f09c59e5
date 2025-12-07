-- Drop the existing policy that uses the function
DROP POLICY IF EXISTS "Super Admins can manage packages" ON public.packages;

-- Create a new policy that directly checks the users table
CREATE POLICY "Super Admins and Team Leaders can manage packages"
ON public.packages
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.users
    WHERE users.user_uuid = auth.uid()
      AND users.unicorn_role IN ('Super Admin', 'Team Leader')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.users
    WHERE users.user_uuid = auth.uid()
      AND users.unicorn_role IN ('Super Admin', 'Team Leader')
  )
);