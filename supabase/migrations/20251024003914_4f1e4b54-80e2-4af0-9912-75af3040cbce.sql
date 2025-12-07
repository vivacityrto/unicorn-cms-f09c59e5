-- Fix the packages table RLS policy to properly handle all operations

-- Drop existing policy
DROP POLICY IF EXISTS "Super admins can manage all packages" ON public.packages;

-- Recreate the policy with proper USING and WITH CHECK clauses
CREATE POLICY "Super admins can manage all packages"
ON public.packages
FOR ALL
TO authenticated
USING (is_super_admin_by_role())
WITH CHECK (is_super_admin_by_role());

-- Also ensure regular users can at least view packages they have access to
-- (if you need non-admin users to view packages, add appropriate policies)