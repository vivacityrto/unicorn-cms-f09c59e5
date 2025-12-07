-- Drop ALL policies on tenant_members to eliminate infinite recursion
DROP POLICY IF EXISTS "tenant_members_delete" ON public.tenant_members;
DROP POLICY IF EXISTS "tenant_members_insert" ON public.tenant_members;
DROP POLICY IF EXISTS "tenant_members_select_by_admin" ON public.tenant_members;
DROP POLICY IF EXISTS "tenant_members_select_simple" ON public.tenant_members;
DROP POLICY IF EXISTS "tenant_members_super_admin_all" ON public.tenant_members;
DROP POLICY IF EXISTS "tenant_members_update" ON public.tenant_members;
DROP POLICY IF EXISTS "super_admin_all_tenant_members" ON public.tenant_members;
DROP POLICY IF EXISTS "members_view_own_membership" ON public.tenant_members;

-- Create only Super Admin policy for tenant_members (no recursion)
CREATE POLICY "tenant_members_super_admin_only"
ON public.tenant_members
FOR ALL
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- Update tenants policies to not use tenant_members at all
DROP POLICY IF EXISTS "tenants_read" ON public.tenants;
DROP POLICY IF EXISTS "tenants_write" ON public.tenants;
DROP POLICY IF EXISTS "super_admin_all_tenants" ON public.tenants;
DROP POLICY IF EXISTS "members_view_own_tenant" ON public.tenants;
DROP POLICY IF EXISTS "admins_update_own_tenant" ON public.tenants;

-- Recreate tenant policies without tenant_members reference
CREATE POLICY "super_admin_all_tenants"
ON public.tenants
FOR ALL
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- Regular users can view their own tenant using the users table directly
CREATE POLICY "users_view_own_tenant"
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