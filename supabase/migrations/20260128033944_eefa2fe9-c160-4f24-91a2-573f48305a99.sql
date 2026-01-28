-- Enable RLS on staff_task_instances
ALTER TABLE public.staff_task_instances ENABLE ROW LEVEL SECURITY;

-- Create is_staff helper function (checks if user is Vivacity team member)
CREATE OR REPLACE FUNCTION public.is_staff()
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
      AND global_role IN ('superadmin', 'SuperAdmin', 'team_leader', 'Team Leader', 'team_member', 'Team Member')
  )
$$;

-- SELECT policy: Authenticated users can read instances for their tenant OR staff/superadmins
CREATE POLICY "Authenticated users can read staff_task_instances"
ON public.staff_task_instances
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.stage_instances si
    JOIN public.package_instances pi ON si.package_instance_id = pi.id
    JOIN public.tenant_users tu ON pi.tenant_id = tu.tenant_id
    WHERE si.id = staff_task_instances.stage_instance_id
    AND tu.user_id = auth.uid()
  )
  OR public.is_superadmin()
  OR public.is_staff()
);

-- UPDATE policy: Staff and SuperAdmins can update
CREATE POLICY "Staff can update staff_task_instances"
ON public.staff_task_instances
FOR UPDATE
TO authenticated
USING (public.is_superadmin() OR public.is_staff())
WITH CHECK (public.is_superadmin() OR public.is_staff());

-- INSERT policy: Staff and SuperAdmins can insert
CREATE POLICY "Staff can insert staff_task_instances"
ON public.staff_task_instances
FOR INSERT
TO authenticated
WITH CHECK (public.is_superadmin() OR public.is_staff());

-- DELETE policy: SuperAdmins only
CREATE POLICY "SuperAdmins can delete staff_task_instances"
ON public.staff_task_instances
FOR DELETE
TO authenticated
USING (public.is_superadmin());