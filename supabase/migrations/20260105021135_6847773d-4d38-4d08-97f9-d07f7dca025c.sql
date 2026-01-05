-- Add tenant_role column for tenant-scoped roles (admin/user)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS tenant_role TEXT DEFAULT 'user';

-- Add check constraint for valid values (drop first in case exists)
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS chk_tenant_role;
ALTER TABLE public.users ADD CONSTRAINT chk_tenant_role 
  CHECK (tenant_role IN ('admin', 'user') OR tenant_role IS NULL);

-- Create index for tenant user lookups
CREATE INDEX IF NOT EXISTS idx_users_tenant_id_role ON public.users(tenant_id, tenant_role) WHERE tenant_id IS NOT NULL;

-- Create a function to check if caller is tenant admin (for RLS)
-- Use bigint to match tenant_id column type
CREATE OR REPLACE FUNCTION public.is_tenant_admin(_user_id uuid, _tenant_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE user_uuid = _user_id
      AND (
        -- Super Admin can manage any tenant
        unicorn_role = 'Super Admin'
        OR 
        -- Tenant admin can manage their own tenant
        (tenant_id = _tenant_id AND tenant_role = 'admin')
      )
  )
$$;

-- Update RLS policy on user_invitations to allow tenant admins to create invites for their tenant
DROP POLICY IF EXISTS "Tenant admins can insert invitations for their tenant" ON public.user_invitations;
CREATE POLICY "Tenant admins can insert invitations for their tenant"
ON public.user_invitations
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_tenant_admin(auth.uid(), tenant_id)
);

-- Allow tenant admins to view invitations for their tenant
DROP POLICY IF EXISTS "Tenant admins can view their tenant invitations" ON public.user_invitations;
CREATE POLICY "Tenant admins can view their tenant invitations"
ON public.user_invitations
FOR SELECT
TO authenticated
USING (
  public.is_tenant_admin(auth.uid(), tenant_id)
);