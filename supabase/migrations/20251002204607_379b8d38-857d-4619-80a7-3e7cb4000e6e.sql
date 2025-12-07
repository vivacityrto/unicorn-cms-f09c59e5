-- Add RLS policies for packages table to allow Super Admins to view
CREATE POLICY "Super Admins can view all packages"
ON public.packages
FOR SELECT
TO authenticated
USING (is_super_admin());

-- Add policy for Admins to view packages
CREATE POLICY "Admins can view all packages"
ON public.packages
FOR SELECT
TO authenticated
USING (get_current_user_role() IN ('Admin', 'Super Admin'));