
-- ============================================================
-- Security Fix: Standardize tenant_profile RLS policies
-- Issue: tenant_profile_business_data
-- Pattern: Use *_safe helper functions for tenant isolation
-- ============================================================

-- 1. DROP existing policies
DROP POLICY IF EXISTS "SuperAdmin and VivacityTeam can manage all tenant profiles" ON public.tenant_profile;
DROP POLICY IF EXISTS "Tenant users can view own profile" ON public.tenant_profile;
DROP POLICY IF EXISTS "tenant_profile_select" ON public.tenant_profile;
DROP POLICY IF EXISTS "tenant_profile_select_staff" ON public.tenant_profile;
DROP POLICY IF EXISTS "tenant_profile_insert" ON public.tenant_profile;
DROP POLICY IF EXISTS "tenant_profile_update" ON public.tenant_profile;
DROP POLICY IF EXISTS "tenant_profile_delete" ON public.tenant_profile;

-- 2. SELECT: Tenant members can view their own tenant's profile
CREATE POLICY "tenant_profile_select"
ON public.tenant_profile
FOR SELECT TO authenticated
USING (
  public.has_tenant_access_safe(tenant_id, auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.is_super_admin_safe(auth.uid())
);

-- 3. INSERT: Only SuperAdmin/Staff can create tenant profiles
CREATE POLICY "tenant_profile_insert"
ON public.tenant_profile
FOR INSERT TO authenticated
WITH CHECK (
  public.is_vivacity_team_safe(auth.uid())
  OR public.is_super_admin_safe(auth.uid())
);

-- 4. UPDATE: Tenant admins can update their own, Staff/SuperAdmin can update any
CREATE POLICY "tenant_profile_update"
ON public.tenant_profile
FOR UPDATE TO authenticated
USING (
  public.has_tenant_access_safe(tenant_id, auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.is_super_admin_safe(auth.uid())
)
WITH CHECK (
  public.has_tenant_access_safe(tenant_id, auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
  OR public.is_super_admin_safe(auth.uid())
);

-- 5. DELETE: Only SuperAdmin can delete tenant profiles
CREATE POLICY "tenant_profile_delete"
ON public.tenant_profile
FOR DELETE TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
);

-- Add documentation comment
COMMENT ON TABLE public.tenant_profile IS 
'Tenant business profile with sensitive data (ABN, ACN, contacts). RLS enforces tenant isolation via has_tenant_access_safe. Staff have global access, only SuperAdmin can delete.';
