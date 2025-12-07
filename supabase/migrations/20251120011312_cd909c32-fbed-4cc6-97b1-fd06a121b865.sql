-- Relax tasks_tenants INSERT policy to allow assigning tasks to other users in the same tenant
DROP POLICY IF EXISTS "Users can create tasks in their tenant" ON public.tasks_tenants;

CREATE POLICY "Users can create tasks in their tenant" 
ON public.tasks_tenants
FOR INSERT
TO public
WITH CHECK (
  is_super_admin() OR tenant_id = get_current_user_tenant()
);