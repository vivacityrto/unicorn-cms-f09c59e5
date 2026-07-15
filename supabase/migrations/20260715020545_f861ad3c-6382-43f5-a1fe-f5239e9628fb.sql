
-- Tighten user_activity tenant-admin read visibility: only tenant admins (via tenant_members.role='Admin') can see peers' activity.
DROP POLICY IF EXISTS user_activity_select_tenant_admin ON public.user_activity;
CREATE POLICY user_activity_select_tenant_admin
ON public.user_activity
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = user_activity.tenant_id
      AND tm.user_id = (SELECT auth.uid())
      AND tm.role = 'Admin'
      AND tm.status = 'active'
  )
);

-- Restrict kpi_ticket_number_counters read to service_role only (internal counter).
DROP POLICY IF EXISTS "kpi_ticket_number_counters staff read" ON public.kpi_ticket_number_counters;
REVOKE SELECT ON public.kpi_ticket_number_counters FROM authenticated, anon;
GRANT ALL ON public.kpi_ticket_number_counters TO service_role;
