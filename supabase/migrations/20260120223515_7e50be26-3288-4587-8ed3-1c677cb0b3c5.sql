-- Security Fix: Time entries RLS - Restrict visibility to own entries or managers
-- Current policy allows ANY user in connected_tenants to view ALL time entries
-- This exposes sensitive billing data, hours, and work notes to all tenant members

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "time_entries_select" ON public.time_entries;

-- Policy 1: Users can only view their own time entries
CREATE POLICY "Users view own time entries"
ON public.time_entries FOR SELECT
USING (user_id = auth.uid());

-- Policy 2: Super Admins and Team Leaders can view all time entries in their tenant
CREATE POLICY "Managers view tenant time entries"
ON public.time_entries FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
    AND (
      -- Super Admin can see all
      u.unicorn_role = 'Super Admin'
      OR
      -- Team Leaders can see entries for tenants they're connected to
      (u.unicorn_role = 'Team Leader' AND EXISTS (
        SELECT 1 FROM public.connected_tenants ct
        WHERE ct.tenant_id = time_entries.tenant_id
        AND ct.user_uuid = auth.uid()
      ))
    )
  )
);