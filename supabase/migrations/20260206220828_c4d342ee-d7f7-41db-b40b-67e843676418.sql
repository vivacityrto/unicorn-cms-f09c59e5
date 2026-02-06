-- RLS Standardization: notification_outbox table
-- This is a diagnostics-only table - users should use notifications table or Teams delivery

-- Drop existing overly-permissive policies
DROP POLICY IF EXISTS "SuperAdmins can view outbox" ON public.notification_outbox;
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notification_outbox;

-- SELECT: SuperAdmin only for diagnostics
CREATE POLICY "notification_outbox_select"
ON public.notification_outbox
FOR SELECT TO authenticated
USING (public.is_super_admin_safe(auth.uid()));

-- INSERT: Block authenticated (service role bypasses RLS)
CREATE POLICY "notification_outbox_insert"
ON public.notification_outbox
FOR INSERT TO authenticated
WITH CHECK (false);

-- UPDATE: Block authenticated (service role bypasses RLS)
CREATE POLICY "notification_outbox_update"
ON public.notification_outbox
FOR UPDATE TO authenticated
USING (false)
WITH CHECK (false);

-- DELETE: Block authenticated (service role bypasses RLS)
CREATE POLICY "notification_outbox_delete"
ON public.notification_outbox
FOR DELETE TO authenticated
USING (false);