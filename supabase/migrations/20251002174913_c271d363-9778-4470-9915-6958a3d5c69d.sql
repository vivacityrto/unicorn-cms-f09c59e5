-- Add foreign key constraint from users.tenant_id to tenants.id
ALTER TABLE public.users 
  DROP CONSTRAINT IF EXISTS users_tenant_id_fkey;

ALTER TABLE public.users 
  ADD CONSTRAINT users_tenant_id_fkey 
  FOREIGN KEY (tenant_id) 
  REFERENCES public.tenants(id) 
  ON DELETE SET NULL;

-- Fix infinite recursion in tenant_members policies
-- Drop all existing policies on tenant_members
DROP POLICY IF EXISTS "tenant_members_select" ON public.tenant_members;
DROP POLICY IF EXISTS "tenant_members_cud" ON public.tenant_members;
DROP POLICY IF EXISTS "tenant_members_rw" ON public.tenant_members;

-- Create simple non-recursive policies for tenant_members
-- Super Admins can do everything
CREATE POLICY "super_admin_all_tenant_members"
ON public.tenant_members
FOR ALL
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- Members can view records where they are the user
CREATE POLICY "members_view_own_membership"
ON public.tenant_members
FOR SELECT
TO authenticated
USING (user_id = auth.uid());