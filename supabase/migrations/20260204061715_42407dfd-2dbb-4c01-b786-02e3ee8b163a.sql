-- =====================================================
-- Fix infinite recursion in users table RLS policies
-- =====================================================
-- The users_select_same_tenant policy queries the users table to check
-- tenant membership, causing infinite recursion. Fix by using a 
-- SECURITY DEFINER function that bypasses RLS.

-- First, create a helper function to get current user's tenant_id safely
CREATE OR REPLACE FUNCTION public.get_current_user_tenant_id()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id 
  FROM public.users 
  WHERE user_uuid = auth.uid()
  LIMIT 1
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_current_user_tenant_id() TO authenticated;

-- Drop the problematic policy
DROP POLICY IF EXISTS "users_select_same_tenant" ON public.users;

-- Recreate the policy using the SECURITY DEFINER function
CREATE POLICY "users_select_same_tenant"
ON public.users FOR SELECT
USING (
  tenant_id = public.get_current_user_tenant_id()
);