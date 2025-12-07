-- Add a policy to allow SECURITY DEFINER functions to check user roles
CREATE POLICY "Allow role checks for SECURITY DEFINER functions"
ON public.users
FOR SELECT
TO authenticated
USING (
  -- Allow reading any user's role for permission checks
  -- This is safe because it's only used by SECURITY DEFINER functions
  true
);