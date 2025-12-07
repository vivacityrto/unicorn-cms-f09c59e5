-- Create helper function to check if user is super admin via tenant_members
CREATE OR REPLACE FUNCTION public.is_super_admin_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
    AND tm.role::text LIKE 'SUPER_ADMIN%'
  )
$$;

-- Drop and recreate the packages policy using the function
DROP POLICY IF EXISTS "Super admins can manage all packages" ON public.packages;

CREATE POLICY "Super admins can manage all packages"
ON public.packages
FOR ALL
TO authenticated
USING (public.is_super_admin_member())
WITH CHECK (public.is_super_admin_member());