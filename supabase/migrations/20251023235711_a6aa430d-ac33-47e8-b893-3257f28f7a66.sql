-- Add RLS policies for tenants table to allow counting

-- Super admins can view all tenants
CREATE POLICY "Super admins can view all tenants"
ON public.tenants
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
    AND tm.role::text LIKE 'SUPER_ADMIN%'
  )
);

-- Users can view their own tenant
CREATE POLICY "Users can view their own tenant"
ON public.tenants
FOR SELECT
TO authenticated
USING (
  id = (
    SELECT tm.tenant_id
    FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
    LIMIT 1
  )
);

-- Allow authenticated users to count tenants by package_id for admin dashboards
CREATE POLICY "Authenticated users can count tenants for statistics"
ON public.tenants
FOR SELECT
TO authenticated
USING (true);