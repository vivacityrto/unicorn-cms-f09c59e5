-- Fix user_invitations table structure and add RLS policies

-- First, drop and recreate the tenant_id column with correct type
ALTER TABLE public.user_invitations DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE public.user_invitations ADD COLUMN tenant_id bigint NOT NULL REFERENCES public.tenants(id);

-- Create RLS policies for user_invitations table
-- Super Admins can read all invitations
CREATE POLICY "Super Admins can view all invitations"
ON public.user_invitations
FOR SELECT
TO authenticated
USING (is_super_admin());

-- Super Admins can insert invitations
CREATE POLICY "Super Admins can create invitations"
ON public.user_invitations
FOR INSERT
TO authenticated
WITH CHECK (is_super_admin());

-- Super Admins can update invitations
CREATE POLICY "Super Admins can update invitations"
ON public.user_invitations
FOR UPDATE
TO authenticated
USING (is_super_admin());

-- Edge functions (service role) can insert invitations
CREATE POLICY "Service role can create invitations"
ON public.user_invitations
FOR INSERT
TO service_role
WITH CHECK (true);

-- Edge functions can update invitations
CREATE POLICY "Service role can update invitations"
ON public.user_invitations
FOR UPDATE
TO service_role
USING (true);