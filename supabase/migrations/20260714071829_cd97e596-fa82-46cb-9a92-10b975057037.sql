
-- Tighten connected_tenants INSERT to require actual tenant membership
DROP POLICY IF EXISTS connected_tenants_users_insert_own ON public.connected_tenants;
CREATE POLICY connected_tenants_users_insert_own
ON public.connected_tenants
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = user_uuid
  AND (
    is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.tenant_id = connected_tenants.tenant_id
        AND tu.user_id = (SELECT auth.uid())
    )
  )
);

-- Also tighten the broad ALL policy's WITH CHECK
DROP POLICY IF EXISTS connected_tenants_write ON public.connected_tenants;
CREATE POLICY connected_tenants_write
ON public.connected_tenants
FOR ALL
TO authenticated
USING (is_super_admin() OR user_uuid = (SELECT auth.uid()))
WITH CHECK (
  is_super_admin()
  OR (
    user_uuid = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.tenant_id = connected_tenants.tenant_id
        AND tu.user_id = (SELECT auth.uid())
    )
  )
);

-- Tighten user_activity INSERT policies to require tenant membership
DROP POLICY IF EXISTS user_activity_insert ON public.user_activity;
CREATE POLICY user_activity_insert
ON public.user_activity
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND (
    tenant_id IS NULL
    OR is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.tenant_id = user_activity.tenant_id
        AND tu.user_id = (SELECT auth.uid())
    )
  )
);

DROP POLICY IF EXISTS user_activity_insert_own ON public.user_activity;
CREATE POLICY user_activity_insert_own
ON public.user_activity
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = user_id
  AND (
    tenant_id IS NULL
    OR is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.tenant_users tu
      WHERE tu.tenant_id = user_activity.tenant_id
        AND tu.user_id = (SELECT auth.uid())
    )
  )
);
