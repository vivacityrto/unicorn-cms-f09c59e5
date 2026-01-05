-- RBAC Model Implementation for Unicorn
-- Creates tenant_members table, adds global_role, and creates helper functions

-- ============================================
-- 1. Create tenant_members table
-- ============================================
CREATE TABLE IF NOT EXISTS public.tenant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'General User' CHECK (role IN ('Admin', 'General User')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  invited_at timestamptz,
  joined_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

-- Enable RLS
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant_id ON public.tenant_members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_user_id ON public.tenant_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant_user_role ON public.tenant_members(tenant_id, user_id, role);

-- ============================================
-- 2. Add global_role column to users table
-- ============================================
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS global_role text;

-- Add check constraint for valid global_role values (NULL or 'SuperAdmin')
ALTER TABLE public.users 
DROP CONSTRAINT IF EXISTS users_global_role_check;

ALTER TABLE public.users 
ADD CONSTRAINT users_global_role_check 
CHECK (global_role IS NULL OR global_role = 'SuperAdmin');

-- Migrate existing Super Admin users to have global_role = 'SuperAdmin'
UPDATE public.users 
SET global_role = 'SuperAdmin' 
WHERE unicorn_role = 'Super Admin';

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_users_global_role 
ON public.users(global_role) 
WHERE global_role IS NOT NULL;

-- ============================================
-- 3. Update is_super_admin to use global_role
-- ============================================
-- Use CREATE OR REPLACE to avoid dropping dependencies
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE user_uuid = auth.uid()
      AND global_role = 'SuperAdmin'
  )
$$;

-- ============================================
-- 4. Create new helper functions
-- ============================================
-- has_tenant_access(tenant_id): Check if user has any membership in the tenant
CREATE OR REPLACE FUNCTION public.has_tenant_access(_tenant_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1
    FROM public.tenant_members
    WHERE tenant_id = _tenant_id
      AND user_id = auth.uid()
      AND status = 'active'
  )
$$;

-- has_tenant_admin(tenant_id): Check if user is Admin for the tenant
CREATE OR REPLACE FUNCTION public.has_tenant_admin(_tenant_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1
    FROM public.tenant_members
    WHERE tenant_id = _tenant_id
      AND user_id = auth.uid()
      AND role = 'Admin'
      AND status = 'active'
  )
$$;

-- ============================================
-- 5. Grant execute permissions on helper functions
-- ============================================
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_tenant_access(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_tenant_admin(bigint) TO authenticated;

-- ============================================
-- 6. Create RLS policies for tenant_members
-- ============================================
-- SuperAdmins can do anything
CREATE POLICY "SuperAdmins can manage all tenant members"
ON public.tenant_members
FOR ALL
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- Tenant admins can manage members of their tenant
CREATE POLICY "Tenant admins can manage their tenant members"
ON public.tenant_members
FOR ALL
USING (public.has_tenant_admin(tenant_id))
WITH CHECK (public.has_tenant_admin(tenant_id));

-- Users can view their own membership
CREATE POLICY "Users can view their own membership"
ON public.tenant_members
FOR SELECT
USING (user_id = auth.uid());

-- ============================================
-- 7. Backfill tenant_members from existing users.tenant_id
-- ============================================
INSERT INTO public.tenant_members (tenant_id, user_id, role, status, joined_at)
SELECT 
  u.tenant_id,
  u.user_uuid,
  CASE 
    WHEN u.tenant_role = 'admin' THEN 'Admin'
    WHEN u.unicorn_role = 'Admin' THEN 'Admin'
    ELSE 'General User'
  END,
  'active',
  COALESCE(u.created_at, now())
FROM public.users u
WHERE u.tenant_id IS NOT NULL
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- ============================================
-- 8. Update user_invitations role values to new format
-- ============================================
UPDATE public.user_invitations 
SET unicorn_role = 'General User' 
WHERE LOWER(unicorn_role) = 'user';

-- ============================================
-- 9. Create trigger for updated_at
-- ============================================
CREATE OR REPLACE FUNCTION public.update_tenant_members_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_tenant_members_updated_at ON public.tenant_members;
CREATE TRIGGER update_tenant_members_updated_at
  BEFORE UPDATE ON public.tenant_members
  FOR EACH ROW
  EXECUTE FUNCTION public.update_tenant_members_updated_at();