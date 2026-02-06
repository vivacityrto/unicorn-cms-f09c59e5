-- ============================================================================
-- Phase 1: RLS Policy Standardization - Critical Security Tables
-- Updates policies on: tenants, tenant_members, tenant_users, users, 
-- auth_tokens, user_invitations to use recursion-safe helper functions
-- ============================================================================

-- ============================================================================
-- TENANTS TABLE
-- ============================================================================

-- Drop and recreate policies using safe functions
DROP POLICY IF EXISTS "Super admins can manage all tenants" ON public.tenants;
DROP POLICY IF EXISTS "tenants_read" ON public.tenants;

-- SuperAdmins can manage all tenants
CREATE POLICY "tenants_manage_superadmin" ON public.tenants
FOR ALL
TO authenticated
USING (public.is_super_admin_safe(auth.uid()))
WITH CHECK (public.is_super_admin_safe(auth.uid()));

-- Vivacity Team (read access) and tenant members can read their own tenant
CREATE POLICY "tenants_select_staff_or_member" ON public.tenants
FOR SELECT
TO authenticated
USING (
  public.is_vivacity_team_safe(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = tenants.id
      AND tm.user_id = auth.uid()
      AND tm.status = 'active'
  )
);

-- ============================================================================
-- TENANT_MEMBERS TABLE
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "SuperAdmins can manage all tenant members" ON public.tenant_members;
DROP POLICY IF EXISTS "Tenant admins can manage their tenant members" ON public.tenant_members;
DROP POLICY IF EXISTS "Users can view their own membership" ON public.tenant_members;
DROP POLICY IF EXISTS "tenant_members_delete_admin_or_sa" ON public.tenant_members;
DROP POLICY IF EXISTS "tenant_members_update_admin_or_sa" ON public.tenant_members;
DROP POLICY IF EXISTS "tenant_members_write_admin_or_sa" ON public.tenant_members;

-- SuperAdmins can manage all tenant members
CREATE POLICY "tenant_members_manage_superadmin" ON public.tenant_members
FOR ALL
TO authenticated
USING (public.is_super_admin_safe(auth.uid()))
WITH CHECK (public.is_super_admin_safe(auth.uid()));

-- Tenant admins can manage members in their tenant
CREATE POLICY "tenant_members_manage_tenant_admin" ON public.tenant_members
FOR ALL
TO authenticated
USING (public.has_tenant_admin_safe(tenant_id, auth.uid()))
WITH CHECK (public.has_tenant_admin_safe(tenant_id, auth.uid()));

-- Users can view their own membership
CREATE POLICY "tenant_members_select_own" ON public.tenant_members
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Vivacity Team can view all tenant members
CREATE POLICY "tenant_members_select_staff" ON public.tenant_members
FOR SELECT
TO authenticated
USING (public.is_vivacity_team_safe(auth.uid()));

-- ============================================================================
-- USERS TABLE
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "users_select_own" ON public.users;
DROP POLICY IF EXISTS "users_select_same_tenant" ON public.users;
DROP POLICY IF EXISTS "users_select_staff" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;
DROP POLICY IF EXISTS "users_update_staff" ON public.users;
DROP POLICY IF EXISTS "users_update_superadmin" ON public.users;

-- Users can view their own profile
CREATE POLICY "users_select_own" ON public.users
FOR SELECT
TO authenticated
USING (user_uuid = auth.uid());

-- Users can view profiles in the same tenant (via tenant_members)
CREATE POLICY "users_select_same_tenant" ON public.users
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
      AND tm.status = 'active'
      AND tm.tenant_id = users.tenant_id
  )
);

-- Vivacity Team can view all user profiles
CREATE POLICY "users_select_staff" ON public.users
FOR SELECT
TO authenticated
USING (public.is_vivacity_team_safe(auth.uid()));

-- Users can update their own profile
CREATE POLICY "users_update_own" ON public.users
FOR UPDATE
TO authenticated
USING (user_uuid = auth.uid())
WITH CHECK (user_uuid = auth.uid());

-- Vivacity Team can update any user profile
CREATE POLICY "users_update_staff" ON public.users
FOR UPDATE
TO authenticated
USING (public.is_vivacity_team_safe(auth.uid()))
WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

-- SuperAdmins have full control
CREATE POLICY "users_manage_superadmin" ON public.users
FOR ALL
TO authenticated
USING (public.is_super_admin_safe(auth.uid()))
WITH CHECK (public.is_super_admin_safe(auth.uid()));

-- ============================================================================
-- AUTH_TOKENS TABLE
-- ============================================================================

-- Drop existing policy
DROP POLICY IF EXISTS "auth_tokens_sa_all" ON public.auth_tokens;

-- SuperAdmins can manage all auth tokens
CREATE POLICY "auth_tokens_manage_superadmin" ON public.auth_tokens
FOR ALL
TO authenticated
USING (public.is_super_admin_safe(auth.uid()))
WITH CHECK (public.is_super_admin_safe(auth.uid()));

-- Users can view/manage their own tokens
CREATE POLICY "auth_tokens_manage_own" ON public.auth_tokens
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- USER_INVITATIONS TABLE
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Admins and Team Leaders can view all invitations" ON public.user_invitations;
DROP POLICY IF EXISTS "Admins can delete invitations" ON public.user_invitations;
DROP POLICY IF EXISTS "Anyone can validate invitation tokens" ON public.user_invitations;
DROP POLICY IF EXISTS "Service role can create invitations" ON public.user_invitations;
DROP POLICY IF EXISTS "Service role can update invitations" ON public.user_invitations;
DROP POLICY IF EXISTS "Super Admins can create invitations" ON public.user_invitations;
DROP POLICY IF EXISTS "Super Admins can update invitations" ON public.user_invitations;
DROP POLICY IF EXISTS "Tenant admins can insert invitations" ON public.user_invitations;
DROP POLICY IF EXISTS "Tenant admins can update invitations" ON public.user_invitations;
DROP POLICY IF EXISTS "Tenant admins can view invitations" ON public.user_invitations;
DROP POLICY IF EXISTS "Users can accept their invitations" ON public.user_invitations;
DROP POLICY IF EXISTS "sa_all_user_invitations" ON public.user_invitations;

-- SuperAdmins can manage all invitations
CREATE POLICY "user_invitations_manage_superadmin" ON public.user_invitations
FOR ALL
TO authenticated
USING (public.is_super_admin_safe(auth.uid()))
WITH CHECK (public.is_super_admin_safe(auth.uid()));

-- Vivacity Team can view all invitations
CREATE POLICY "user_invitations_select_staff" ON public.user_invitations
FOR SELECT
TO authenticated
USING (public.is_vivacity_team_safe(auth.uid()));

-- Tenant admins can manage invitations for their tenant
CREATE POLICY "user_invitations_manage_tenant_admin" ON public.user_invitations
FOR ALL
TO authenticated
USING (public.has_tenant_admin_safe(tenant_id, auth.uid()))
WITH CHECK (public.has_tenant_admin_safe(tenant_id, auth.uid()));

-- Anyone can read pending invitations for token validation (public access for invitation flow)
CREATE POLICY "user_invitations_validate_public" ON public.user_invitations
FOR SELECT
USING (
  status = 'pending'
  AND expires_at > now()
  AND token_hash IS NOT NULL
);

-- Users can accept their own invitations (update to successful/expired)
CREATE POLICY "user_invitations_accept" ON public.user_invitations
FOR UPDATE
USING (
  token_hash IS NOT NULL
  AND status = 'pending'
)
WITH CHECK (
  status IN ('successful', 'expired')
);

-- Service role bypasses RLS, but for edge functions creating invitations
-- we need to allow INSERT via service role (this is handled by verify_jwt = false)