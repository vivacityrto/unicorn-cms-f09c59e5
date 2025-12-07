-- Drop the existing INSERT policy
DROP POLICY IF EXISTS "Users can create tasks in their tenant" ON public.tasks_tenants;

-- Create a new INSERT policy that allows Super Admins to create tasks for any tenant
CREATE POLICY "Users can create tasks in their tenant" ON public.tasks_tenants
FOR INSERT
TO public
WITH CHECK (
  is_super_admin() OR 
  ((tenant_id = get_current_user_tenant()) AND (created_by = auth.uid()))
);