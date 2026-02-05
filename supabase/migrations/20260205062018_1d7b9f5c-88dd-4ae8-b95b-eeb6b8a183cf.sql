-- Fix tenant_addresses RLS policies to restrict access to tenant members only
-- The old policies were dropped in the previous migration attempt

-- Create restricted SELECT policy: Only tenant members and SuperAdmins can view addresses
CREATE POLICY "Tenant members can view addresses"
ON public.tenant_addresses
FOR SELECT
USING (
  -- SuperAdmins can view all addresses
  is_super_admin()
  OR
  -- Staff users (Vivacity employees) can view all addresses
  is_staff()
  OR
  -- Users who are actual members of the tenant (not just connected consultants)
  EXISTS (
    SELECT 1 FROM public.tenant_users tu 
    WHERE tu.user_id = auth.uid() 
    AND tu.tenant_id = tenant_addresses.tenant_id
  )
);

-- Create restricted INSERT policy: Only tenant admins and SuperAdmins can add addresses
CREATE POLICY "Tenant admins can insert addresses"
ON public.tenant_addresses
FOR INSERT
WITH CHECK (
  -- SuperAdmins can insert addresses for any tenant
  is_super_admin()
  OR
  -- Staff users can insert addresses
  is_staff()
  OR
  -- Tenant admins can insert addresses for their tenant
  EXISTS (
    SELECT 1 FROM public.tenant_users tu 
    WHERE tu.user_id = auth.uid() 
    AND tu.tenant_id = tenant_addresses.tenant_id
    AND tu.role IN ('admin', 'Admin')
  )
);

-- Create restricted UPDATE policy: Only tenant admins and SuperAdmins can update addresses
CREATE POLICY "Tenant admins can update addresses"
ON public.tenant_addresses
FOR UPDATE
USING (
  is_super_admin()
  OR
  is_staff()
  OR
  EXISTS (
    SELECT 1 FROM public.tenant_users tu 
    WHERE tu.user_id = auth.uid() 
    AND tu.tenant_id = tenant_addresses.tenant_id
    AND tu.role IN ('admin', 'Admin')
  )
);

-- Create restricted DELETE policy: Only tenant admins and SuperAdmins can delete addresses
CREATE POLICY "Tenant admins can delete addresses"
ON public.tenant_addresses
FOR DELETE
USING (
  is_super_admin()
  OR
  is_staff()
  OR
  EXISTS (
    SELECT 1 FROM public.tenant_users tu 
    WHERE tu.user_id = auth.uid() 
    AND tu.tenant_id = tenant_addresses.tenant_id
    AND tu.role IN ('admin', 'Admin')
  )
);