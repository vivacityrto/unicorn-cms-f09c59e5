-- =====================================================
-- Fix users table RLS policies for proper access control
-- =====================================================
-- The users table has RLS enabled but policies are too restrictive.
-- Staff need to see all users for management, and tenant members
-- need to see other users in their tenant for features like
-- Rock assignment, EOS meetings, etc.

-- First, drop any duplicate/conflicting policies
DROP POLICY IF EXISTS "Users can read their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can read own record for auth" ON public.users;
DROP POLICY IF EXISTS "Super Admins can read all profiles" ON public.users;
DROP POLICY IF EXISTS "Super Admins can update all profiles" ON public.users;
DROP POLICY IF EXISTS "SuperAdmin can update any user avatar" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "Staff can view all users" ON public.users;
DROP POLICY IF EXISTS "Tenant members can view users in their tenant" ON public.users;

-- Create comprehensive SELECT policies:

-- 1. Users can always read their own profile
CREATE POLICY "users_select_own"
ON public.users FOR SELECT
USING (user_uuid = auth.uid());

-- 2. Staff (Vivacity team members) can view all user profiles for management
CREATE POLICY "users_select_staff"
ON public.users FOR SELECT
USING (is_staff());

-- 3. Tenant members can view basic info about other users in their tenant
-- This is needed for features like Rock assignment, EOS participant selection, etc.
CREATE POLICY "users_select_same_tenant"
ON public.users FOR SELECT
USING (
  tenant_id IN (
    SELECT u.tenant_id 
    FROM public.users u 
    WHERE u.user_uuid = auth.uid()
  )
);

-- Create UPDATE policies:

-- 1. Users can update their own profile
CREATE POLICY "users_update_own"
ON public.users FOR UPDATE
USING (user_uuid = auth.uid())
WITH CHECK (user_uuid = auth.uid());

-- 2. SuperAdmins can update any profile (for admin functions)
CREATE POLICY "users_update_superadmin"
ON public.users FOR UPDATE
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- 3. Staff can update user profiles for management
CREATE POLICY "users_update_staff"
ON public.users FOR UPDATE
USING (is_staff())
WITH CHECK (is_staff());

-- Note: INSERT policies are not added as user creation is handled
-- through auth.users and trigger-based profile creation.
-- DELETE is also restricted to prevent accidental user deletion.