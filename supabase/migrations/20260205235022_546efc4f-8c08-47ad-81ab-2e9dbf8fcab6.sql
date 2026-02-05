-- Fix tenant_addresses RLS policies by consolidating into clear, non-overlapping policies
-- Remove all existing policies and create consolidated ones

-- Drop existing duplicate/overlapping policies
DROP POLICY IF EXISTS "Tenant members can view addresses" ON public.tenant_addresses;
DROP POLICY IF EXISTS "Tenant admins can insert addresses" ON public.tenant_addresses;
DROP POLICY IF EXISTS "Tenant admins can update addresses" ON public.tenant_addresses;
DROP POLICY IF EXISTS "Tenant admins can delete addresses" ON public.tenant_addresses;
DROP POLICY IF EXISTS "Users can view addresses for their accessible tenants" ON public.tenant_addresses;
DROP POLICY IF EXISTS "Users can insert addresses for their accessible tenants" ON public.tenant_addresses;
DROP POLICY IF EXISTS "Users can update addresses for their accessible tenants" ON public.tenant_addresses;
DROP POLICY IF EXISTS "Users can delete addresses for their accessible tenants" ON public.tenant_addresses;

-- Create consolidated, clear policies using the recursion-safe pattern

-- SELECT: SuperAdmins, Staff, or tenant members can view addresses
CREATE POLICY "tenant_addresses_select"
ON public.tenant_addresses FOR SELECT
TO authenticated
USING (
  is_super_admin() 
  OR is_staff() 
  OR public.user_has_tenant_access(tenant_id)
);

-- INSERT: SuperAdmins, Staff, or tenant admins can create addresses
CREATE POLICY "tenant_addresses_insert"
ON public.tenant_addresses FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin() 
  OR is_staff() 
  OR EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.user_id = auth.uid() 
    AND tu.tenant_id = tenant_addresses.tenant_id 
    AND tu.role IN ('admin', 'Admin')
  )
);

-- UPDATE: SuperAdmins, Staff, or tenant admins can update addresses
CREATE POLICY "tenant_addresses_update"
ON public.tenant_addresses FOR UPDATE
TO authenticated
USING (
  is_super_admin() 
  OR is_staff() 
  OR EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.user_id = auth.uid() 
    AND tu.tenant_id = tenant_addresses.tenant_id 
    AND tu.role IN ('admin', 'Admin')
  )
)
WITH CHECK (
  is_super_admin() 
  OR is_staff() 
  OR EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.user_id = auth.uid() 
    AND tu.tenant_id = tenant_addresses.tenant_id 
    AND tu.role IN ('admin', 'Admin')
  )
);

-- DELETE: SuperAdmins, Staff, or tenant admins can delete addresses
CREATE POLICY "tenant_addresses_delete"
ON public.tenant_addresses FOR DELETE
TO authenticated
USING (
  is_super_admin() 
  OR is_staff() 
  OR EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.user_id = auth.uid() 
    AND tu.tenant_id = tenant_addresses.tenant_id 
    AND tu.role IN ('admin', 'Admin')
  )
);