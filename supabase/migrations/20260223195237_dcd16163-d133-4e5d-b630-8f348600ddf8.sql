-- Allow Vivacity staff to insert time entries for any user (needed for ClickUp time transfer)
DROP POLICY IF EXISTS "time_entries_insert" ON public.time_entries;

CREATE POLICY "time_entries_insert"
ON public.time_entries
FOR INSERT
TO authenticated
WITH CHECK (
  (
    -- Own entries: user can insert for themselves
    user_id = auth.uid()
    AND has_tenant_access_safe(tenant_id::bigint, auth.uid())
  )
  OR
  (
    -- Staff entries: Vivacity staff can insert for any user
    is_vivacity_staff(auth.uid())
    AND has_tenant_access_safe(tenant_id::bigint, auth.uid())
  )
);