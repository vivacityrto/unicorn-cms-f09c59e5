
-- ============================================================
-- Security Fix: Add proper SELECT RLS policies to profiles table
-- Issue: profiles_table_missing_rls
-- Pattern: Owner + Staff + Same-Tenant access via users table
-- ============================================================

-- 1. DROP any existing SELECT policies (none exist currently)
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_staff" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_same_tenant" ON public.profiles;

-- 2. CREATE SELECT policy: Users can view their own profile
CREATE POLICY "profiles_select_own"
ON public.profiles
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- 3. CREATE SELECT policy: SuperAdmins and Vivacity staff can view all
CREATE POLICY "profiles_select_staff"
ON public.profiles
FOR SELECT TO authenticated
USING (
  public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
);

-- 4. CREATE SELECT policy: Users can view profiles of users in the same tenant
-- This joins through the users table to check tenant membership
CREATE POLICY "profiles_select_same_tenant"
ON public.profiles
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM public.users profile_user
    JOIN public.users current_user_record ON current_user_record.user_uuid = auth.uid()
    WHERE profile_user.user_uuid = profiles.user_id
      AND profile_user.tenant_id IS NOT NULL
      AND current_user_record.tenant_id IS NOT NULL
      AND profile_user.tenant_id = current_user_record.tenant_id
  )
);

-- 5. Also fix the existing INSERT/UPDATE policies to use safe functions
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "profiles_insert_own"
ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR public.is_super_admin_safe(auth.uid())
);

CREATE POLICY "profiles_update_own"
ON public.profiles
FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_super_admin_safe(auth.uid())
)
WITH CHECK (
  user_id = auth.uid()
  OR public.is_super_admin_safe(auth.uid())
);

-- 6. Add DELETE policy for completeness
CREATE POLICY "profiles_delete_own"
ON public.profiles
FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_super_admin_safe(auth.uid())
);

-- Add documentation comment
COMMENT ON TABLE public.profiles IS 
'User profile information with RLS enforcing: owner access, staff access, and same-tenant visibility via users table relationship.';
