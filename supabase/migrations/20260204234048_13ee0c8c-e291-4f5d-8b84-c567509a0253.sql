-- =====================================================
-- Fix audit_invites RLS policies
-- This audit table should only be accessible by SuperAdmins 
-- and Vivacity staff for review purposes
-- =====================================================

-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "audit_invites_insert_service" ON public.audit_invites;
DROP POLICY IF EXISTS "audit_invites_select_admin" ON public.audit_invites;

-- SuperAdmins and Vivacity staff can view all audit invite records
CREATE POLICY "Staff can view audit invites"
ON public.audit_invites
FOR SELECT
TO authenticated
USING (
  public.is_superadmin() OR public.is_vivacity_team_user(auth.uid())
);

-- Only edge functions (service role) should insert audit records
-- Regular users should not insert directly - this happens via edge functions
-- We restrict to SuperAdmins for any manual corrections needed
CREATE POLICY "SuperAdmins can insert audit invites"
ON public.audit_invites
FOR INSERT
TO authenticated
WITH CHECK (public.is_superadmin());

-- SuperAdmins can update for corrections
CREATE POLICY "SuperAdmins can update audit invites"
ON public.audit_invites
FOR UPDATE
TO authenticated
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

-- SuperAdmins can delete for cleanup
CREATE POLICY "SuperAdmins can delete audit invites"
ON public.audit_invites
FOR DELETE
TO authenticated
USING (public.is_superadmin());