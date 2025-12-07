-- Drop and recreate is_super_admin_by_role function with correct auth context
-- First drop dependent policies
DROP POLICY IF EXISTS "Super admins can manage all packages" ON public.packages;

-- Drop the function
DROP FUNCTION IF EXISTS public.is_super_admin_by_role();

-- Recreate with proper auth.uid() access (use plpgsql instead of sql)
CREATE OR REPLACE FUNCTION public.is_super_admin_by_role()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.users
    WHERE user_uuid = auth.uid()
    AND unicorn_role = 'Super Admin'
  );
END;
$$;

-- Recreate the policy
CREATE POLICY "Super admins can manage all packages"
ON public.packages
FOR ALL
TO authenticated
USING (is_super_admin_by_role())
WITH CHECK (is_super_admin_by_role());