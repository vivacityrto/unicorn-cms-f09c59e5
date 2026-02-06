-- ============================================================================
-- RLS Helper Functions Consolidation
-- Consolidates scattered RLS helper functions into a unified, consistent set
-- following recursion-safe patterns with proper archived/status checks
-- ============================================================================

-- ============================================================================
-- STEP 1: Core Recursion-Safe Predicates
-- ============================================================================

-- 1a. is_super_admin_safe(uuid) - Recursion-safe SuperAdmin check
-- Checks both unicorn_role and legacy global_role columns
CREATE OR REPLACE FUNCTION public.is_super_admin_safe(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = p_user_id
      AND (
        unicorn_role = 'Super Admin'
        OR global_role = 'SuperAdmin'
      )
      AND archived IS DISTINCT FROM true
  );
$$;

COMMENT ON FUNCTION public.is_super_admin_safe(uuid) IS 
'Recursion-safe SuperAdmin check. Validates both unicorn_role and legacy global_role. 
Use in RLS policies to prevent infinite recursion (error 42P17).';

-- 1b. is_vivacity_team_safe(uuid) - Recursion-safe Vivacity Team check
-- Already exists but reapply for consistency and to ensure correct implementation
CREATE OR REPLACE FUNCTION public.is_vivacity_team_safe(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = p_user_id
      AND unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
      AND archived IS DISTINCT FROM true
  );
$$;

COMMENT ON FUNCTION public.is_vivacity_team_safe(uuid) IS 
'Recursion-safe Vivacity Team check. Validates unicorn_role and archived flag.
Use in RLS policies to prevent infinite recursion (error 42P17).';

-- 1c. has_tenant_access_safe(bigint, uuid) - Recursion-safe tenant access check
-- Returns true if SuperAdmin, Vivacity Team, or has active tenant_members entry
CREATE OR REPLACE FUNCTION public.has_tenant_access_safe(p_tenant_id bigint, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT 
    public.is_super_admin_safe(p_user_id)
    OR public.is_vivacity_team_safe(p_user_id)
    OR EXISTS (
      SELECT 1 FROM public.tenant_members
      WHERE tenant_id = p_tenant_id
        AND user_id = p_user_id
        AND status = 'active'
    );
$$;

COMMENT ON FUNCTION public.has_tenant_access_safe(bigint, uuid) IS 
'Recursion-safe tenant access check. Returns true for SuperAdmins, Vivacity Team members, 
or users with active tenant_members entry. Use in RLS policies.';

-- 1d. has_tenant_admin_safe(bigint, uuid) - Recursion-safe tenant admin check
CREATE OR REPLACE FUNCTION public.has_tenant_admin_safe(p_tenant_id bigint, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT 
    public.is_super_admin_safe(p_user_id)
    OR EXISTS (
      SELECT 1 FROM public.tenant_members
      WHERE tenant_id = p_tenant_id
        AND user_id = p_user_id
        AND role = 'Admin'
        AND status = 'active'
    );
$$;

COMMENT ON FUNCTION public.has_tenant_admin_safe(bigint, uuid) IS 
'Recursion-safe tenant Admin check. Returns true for SuperAdmins or tenant Admins with active status.';

-- ============================================================================
-- STEP 2: Update Convenience Wrappers (for application code, not RLS)
-- ============================================================================

-- Update is_super_admin() to use the safe version
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin_safe(auth.uid());
$$;

COMMENT ON FUNCTION public.is_super_admin() IS 
'Convenience wrapper for is_super_admin_safe(). For application code, not RLS policies.';

-- Update has_tenant_access() to use the safe version
CREATE OR REPLACE FUNCTION public.has_tenant_access(_tenant_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_tenant_access_safe(_tenant_id, auth.uid());
$$;

COMMENT ON FUNCTION public.has_tenant_access(bigint) IS 
'Convenience wrapper for has_tenant_access_safe(). For application code, not RLS policies.';

-- Update has_tenant_admin() to use the safe version
CREATE OR REPLACE FUNCTION public.has_tenant_admin(_tenant_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_tenant_admin_safe(_tenant_id, auth.uid());
$$;

COMMENT ON FUNCTION public.has_tenant_admin(bigint) IS 
'Convenience wrapper for has_tenant_admin_safe(). For application code, not RLS policies.';

-- ============================================================================
-- STEP 3: Deprecate Legacy Functions (add comments, keep for backward compat)
-- ============================================================================

-- Mark user_has_tenant_access as deprecated
COMMENT ON FUNCTION public.user_has_tenant_access(bigint) IS 
'DEPRECATED: Use has_tenant_access_safe(bigint, uuid) instead. 
This function lacks status/archived checks and queries the wrong table.';

-- Mark user_in_tenant as deprecated (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'user_in_tenant' AND pronamespace = 'public'::regnamespace) THEN
    COMMENT ON FUNCTION public.user_in_tenant(bigint) IS 
    'DEPRECATED: Use has_tenant_access_safe(bigint, uuid) instead. 
    This function lacks status checks and uses the legacy tenant model.';
  END IF;
END $$;

-- Mark is_vivacity_team_user as deprecated
COMMENT ON FUNCTION public.is_vivacity_team_user(uuid) IS 
'DEPRECATED: Use is_vivacity_team_safe(uuid) instead for consistency.';

-- Mark is_vivacity_team_v2 as deprecated (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_vivacity_team_v2' AND pronamespace = 'public'::regnamespace) THEN
    COMMENT ON FUNCTION public.is_vivacity_team_v2(uuid) IS 
    'DEPRECATED: Use is_vivacity_team_safe(uuid) instead for consistency.';
  END IF;
END $$;

-- ============================================================================
-- STEP 4: Grant Execute Permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.is_super_admin_safe(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_vivacity_team_safe(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_tenant_access_safe(bigint, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_tenant_admin_safe(bigint, uuid) TO authenticated;

-- Also grant to service_role for edge functions
GRANT EXECUTE ON FUNCTION public.is_super_admin_safe(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_vivacity_team_safe(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_tenant_access_safe(bigint, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_tenant_admin_safe(bigint, uuid) TO service_role;