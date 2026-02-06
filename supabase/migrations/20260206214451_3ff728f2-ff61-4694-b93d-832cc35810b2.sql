-- ============================================================================
-- RLS Policies for user_microsoft_identities
-- ============================================================================

-- Enable RLS
ALTER TABLE public.user_microsoft_identities ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "identities_select_own" ON public.user_microsoft_identities;
DROP POLICY IF EXISTS "identities_select_superadmin" ON public.user_microsoft_identities;
DROP POLICY IF EXISTS "identities_insert_own" ON public.user_microsoft_identities;
DROP POLICY IF EXISTS "identities_update_own" ON public.user_microsoft_identities;
DROP POLICY IF EXISTS "identities_delete_superadmin" ON public.user_microsoft_identities;

-- SELECT: Own record OR SuperAdmin
CREATE POLICY "identities_select"
ON public.user_microsoft_identities
FOR SELECT TO authenticated
USING (
  user_uuid = auth.uid()
  OR public.is_super_admin_safe(auth.uid())
);

-- INSERT: Own record only
CREATE POLICY "identities_insert"
ON public.user_microsoft_identities
FOR INSERT TO authenticated
WITH CHECK (user_uuid = auth.uid());

-- UPDATE: Own record only
CREATE POLICY "identities_update"
ON public.user_microsoft_identities
FOR UPDATE TO authenticated
USING (user_uuid = auth.uid())
WITH CHECK (user_uuid = auth.uid());

-- DELETE: SuperAdmin only
CREATE POLICY "identities_delete"
ON public.user_microsoft_identities
FOR DELETE TO authenticated
USING (public.is_super_admin_safe(auth.uid()));