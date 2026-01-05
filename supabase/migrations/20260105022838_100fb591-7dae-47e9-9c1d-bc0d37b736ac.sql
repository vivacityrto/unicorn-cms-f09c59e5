-- Update user_invitations RLS policies to use new RBAC model

-- Drop the old delete policy that uses unicorn_role enum
DROP POLICY IF EXISTS "Super admins can delete invitations" ON public.user_invitations;

-- Create new delete policy using is_super_admin() or has_tenant_admin()
CREATE POLICY "Admins can delete invitations"
ON public.user_invitations
FOR DELETE
USING (public.is_super_admin() OR public.has_tenant_admin(tenant_id));

-- Update the tenant admin insert policy to use has_tenant_admin
DROP POLICY IF EXISTS "Tenant admins can insert invitations for their tenant" ON public.user_invitations;

CREATE POLICY "Tenant admins can insert invitations"
ON public.user_invitations
FOR INSERT
WITH CHECK (public.is_super_admin() OR public.has_tenant_admin(tenant_id));

-- Update tenant admin select policy
DROP POLICY IF EXISTS "Tenant admins can view their tenant invitations" ON public.user_invitations;

CREATE POLICY "Tenant admins can view invitations"
ON public.user_invitations
FOR SELECT
USING (public.is_super_admin() OR public.has_tenant_admin(tenant_id));

-- Allow tenant admins to update invitations for their tenant
CREATE POLICY "Tenant admins can update invitations"
ON public.user_invitations
FOR UPDATE
USING (public.is_super_admin() OR public.has_tenant_admin(tenant_id))
WITH CHECK (public.is_super_admin() OR public.has_tenant_admin(tenant_id));