DROP POLICY IF EXISTS tenants_select_academy_only_users ON public.tenants;

CREATE POLICY tenants_select_academy_only_users
ON public.tenants
FOR SELECT
TO authenticated
USING (
  academy_access_enabled = true
  AND EXISTS (
    SELECT 1 FROM public.tenant_users tu
    WHERE tu.tenant_id = tenants.id
      AND tu.user_id = auth.uid()
      AND tu.access_scope = 'academy_only'
  )
);