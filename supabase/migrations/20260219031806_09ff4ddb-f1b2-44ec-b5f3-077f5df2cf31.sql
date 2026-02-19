
-- Fix 1: Add FK constraint so PostgREST can discover the tenant_users → users relationship
ALTER TABLE public.tenant_users
  ADD CONSTRAINT tenant_users_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(user_uuid)
  ON DELETE CASCADE;

-- Fix 2: Replace the overly-restrictive RLS SELECT policy to also allow SuperAdmin and Vivacity staff
DROP POLICY IF EXISTS tenant_users_select ON public.tenant_users;

CREATE POLICY tenant_users_select ON public.tenant_users
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR is_tenant_parent_safe(tenant_id, auth.uid())
    OR is_super_admin_safe(auth.uid())
    OR is_vivacity_staff(auth.uid())
  );
