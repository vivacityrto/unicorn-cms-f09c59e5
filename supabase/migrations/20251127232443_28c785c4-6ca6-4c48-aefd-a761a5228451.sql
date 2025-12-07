
-- Drop problematic INSERT policies and recreate them properly
DROP POLICY IF EXISTS "Users can create tasks in their tenant" ON public.tasks_tenants;
DROP POLICY IF EXISTS "Vivacity team can insert tasks" ON public.tasks_tenants;

-- Create a single, clear INSERT policy for Vivacity Team users
CREATE POLICY "Vivacity team can create tasks"
ON public.tasks_tenants
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.user_uuid = auth.uid() 
    AND u.user_type::text = 'Vivacity Team'
  )
);

-- Create INSERT policy for regular users (only in their own tenant)
CREATE POLICY "Users can create tasks in their own tenant"
ON public.tasks_tenants
FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin() 
  OR (
    tenant_id::bigint = (
      SELECT u.tenant_id::bigint 
      FROM public.users u 
      WHERE u.user_uuid = auth.uid()
    )
  )
);
