-- Add RLS policies for packages table

-- Super admins can manage all packages
CREATE POLICY "Super admins can manage all packages"
ON public.packages
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
    AND tm.role::text LIKE 'SUPER_ADMIN%'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
    AND tm.role::text LIKE 'SUPER_ADMIN%'
  )
);

-- All authenticated users can view packages (for dropdowns/lists)
CREATE POLICY "Authenticated users can view packages"
ON public.packages
FOR SELECT
TO authenticated
USING (true);