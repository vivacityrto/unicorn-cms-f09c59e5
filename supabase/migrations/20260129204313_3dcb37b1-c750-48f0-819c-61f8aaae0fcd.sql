-- Create security definer function to check tenant access (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.user_has_tenant_access(p_tenant_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_users
    WHERE tenant_id = p_tenant_id
      AND user_id = auth.uid()
  )
$$;

-- Drop the problematic policy
DROP POLICY IF EXISTS "Authenticated users can read staff_task_instances" ON public.staff_task_instances;

-- Drop the duplicate permissive policies that allow all access
DROP POLICY IF EXISTS "Users can view staff task instances" ON public.staff_task_instances;
DROP POLICY IF EXISTS "Users can update staff task instances" ON public.staff_task_instances;

-- Recreate with security definer function to avoid recursion
CREATE POLICY "Authenticated users can read staff_task_instances"
ON public.staff_task_instances
FOR SELECT
TO authenticated
USING (
  is_superadmin() OR is_staff() OR
  EXISTS (
    SELECT 1
    FROM stage_instances si
    JOIN package_instances pi ON si.packageinstance_id = pi.id
    WHERE si.id = staff_task_instances.stageinstance_id
      AND public.user_has_tenant_access(pi.tenant_id)
  )
);

-- Add proper tenant-scoped update policy
CREATE POLICY "Tenant users can update their staff_task_instances"
ON public.staff_task_instances
FOR UPDATE
TO authenticated
USING (
  is_superadmin() OR is_staff() OR
  EXISTS (
    SELECT 1
    FROM stage_instances si
    JOIN package_instances pi ON si.packageinstance_id = pi.id
    WHERE si.id = staff_task_instances.stageinstance_id
      AND public.user_has_tenant_access(pi.tenant_id)
  )
);