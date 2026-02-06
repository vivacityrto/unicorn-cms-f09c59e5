-- Fix RLS policies on tasks_tenants to use SECURITY DEFINER functions instead of subqueries
-- This prevents infinite recursion issues with the users table

-- Drop existing Vivacity Team policies that use subqueries
DROP POLICY IF EXISTS "Vivacity team can view all tasks" ON public.tasks_tenants;
DROP POLICY IF EXISTS "Vivacity team can update tasks" ON public.tasks_tenants;
DROP POLICY IF EXISTS "Vivacity team can create tasks" ON public.tasks_tenants;

-- Recreate policies using SECURITY DEFINER functions with explicit call to is_vivacity_team(auth.uid())
CREATE POLICY "Vivacity team can view all tasks"
ON public.tasks_tenants
FOR SELECT
TO authenticated
USING (public.is_vivacity_team(auth.uid()));

CREATE POLICY "Vivacity team can update tasks"
ON public.tasks_tenants
FOR UPDATE
TO authenticated
USING (public.is_vivacity_team(auth.uid()))
WITH CHECK (public.is_vivacity_team(auth.uid()));

CREATE POLICY "Vivacity team can create tasks"
ON public.tasks_tenants
FOR INSERT
TO authenticated
WITH CHECK (public.is_vivacity_team(auth.uid()));

-- Also fix the general "Users can view/update tasks in their tenant" policies
DROP POLICY IF EXISTS "Users can view tasks in their tenant" ON public.tasks_tenants;
DROP POLICY IF EXISTS "Users can update tasks in their tenant" ON public.tasks_tenants;

CREATE POLICY "Users can view tasks in their tenant"
ON public.tasks_tenants
FOR SELECT
TO authenticated
USING (
  tenant_id = public.get_current_user_tenant()
  OR public.is_super_admin()
);

CREATE POLICY "Users can update tasks in their tenant"
ON public.tasks_tenants
FOR UPDATE
TO authenticated
USING (
  tenant_id = public.get_current_user_tenant()
  OR public.is_super_admin()
);

COMMENT ON POLICY "Vivacity team can view all tasks" ON public.tasks_tenants IS 'Uses is_vivacity_team(auth.uid()) function to avoid RLS recursion';