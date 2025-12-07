-- Drop existing problematic policies on tenants table
DROP POLICY IF EXISTS "tenants_select" ON public.tenants;
DROP POLICY IF EXISTS "tenants_cud" ON public.tenants;
DROP POLICY IF EXISTS "tenants_rw" ON public.tenants;

-- Create new policies for tenants table that avoid infinite recursion
-- Super Admins can view all tenants
CREATE POLICY "super_admin_all_tenants"
ON public.tenants
FOR ALL
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- Tenant members can view their own tenant
CREATE POLICY "members_view_own_tenant"
ON public.tenants
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT tenant_id 
    FROM public.users 
    WHERE user_uuid = auth.uid()
  )
);

-- Tenant admins can update their own tenant
CREATE POLICY "admins_update_own_tenant"
ON public.tenants
FOR UPDATE
TO authenticated
USING (
  id IN (
    SELECT tenant_id 
    FROM public.users 
    WHERE user_uuid = auth.uid() 
    AND unicorn_role = 'Admin'
  )
)
WITH CHECK (
  id IN (
    SELECT tenant_id 
    FROM public.users 
    WHERE user_uuid = auth.uid() 
    AND unicorn_role = 'Admin'
  )
);