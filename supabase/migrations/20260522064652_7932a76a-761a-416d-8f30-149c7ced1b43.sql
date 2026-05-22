DROP POLICY IF EXISTS processes_admin_select ON public.processes;
CREATE POLICY processes_admin_select ON public.processes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = (SELECT auth.uid())
      AND u.unicorn_role = 'Admin'
      AND u.tenant_id IS NOT NULL
      AND u.tenant_id = processes.tenant_id
  )
);

DROP POLICY IF EXISTS processes_users_select_approved ON public.processes;
CREATE POLICY processes_users_select_approved ON public.processes
FOR SELECT
USING (
  status = 'approved'
  AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = (SELECT auth.uid())
      AND u.unicorn_role = 'User'
      AND u.tenant_id IS NOT NULL
      AND u.tenant_id = processes.tenant_id
  )
);