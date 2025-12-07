-- Remove old conflicting policies on packages table
DROP POLICY IF EXISTS "Super Admins can insert packages" ON public.packages;
DROP POLICY IF EXISTS "Super Admins can update packages" ON public.packages;
DROP POLICY IF EXISTS "Super Admins can delete packages" ON public.packages;
DROP POLICY IF EXISTS "packages_select_authenticated" ON public.packages;

-- The correct policies using tenant_members already exist:
-- "Super admins can manage all packages" (FOR ALL)
-- "Authenticated users can view packages" (FOR SELECT)