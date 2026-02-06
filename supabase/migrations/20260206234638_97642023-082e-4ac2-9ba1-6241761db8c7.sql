-- ============================================================================
-- OAUTH_STATES RLS HARDENING
-- ============================================================================
-- This table stores temporary OAuth state tokens during authentication flows.
-- It should ONLY be accessed by edge functions using the service role.
-- Client-side access is not needed and creates security warnings.
--
-- Design Decision: Remove authenticated user policies entirely.
-- The service_role bypasses RLS, so edge functions will continue to work.
-- ============================================================================

-- Drop the overly permissive policies for authenticated users
DROP POLICY IF EXISTS "oauth_states_select" ON public.oauth_states;
DROP POLICY IF EXISTS "oauth_states_insert" ON public.oauth_states;
DROP POLICY IF EXISTS "oauth_states_delete" ON public.oauth_states;
DROP POLICY IF EXISTS "Service role can manage oauth states" ON public.oauth_states;

-- Create restrictive policies - SuperAdmin only for emergency debugging
-- Normal operations use service_role which bypasses RLS

CREATE POLICY "superadmin_select_oauth_states" 
ON public.oauth_states 
FOR SELECT 
TO authenticated
USING (public.is_super_admin_safe(auth.uid()));

CREATE POLICY "superadmin_manage_oauth_states" 
ON public.oauth_states 
FOR ALL 
TO authenticated
USING (public.is_super_admin_safe(auth.uid()))
WITH CHECK (public.is_super_admin_safe(auth.uid()));

-- Add table comment documenting the security design
COMMENT ON TABLE public.oauth_states IS 
'Temporary OAuth state storage. Managed exclusively by edge functions (service_role). 
Client-side access restricted to SuperAdmin for debugging only. 
States are short-lived and auto-expire via expires_at column.';