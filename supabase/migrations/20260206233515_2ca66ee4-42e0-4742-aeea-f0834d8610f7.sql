-- ============================================================================
-- PHASE 1: SECURITY HARDENING - Restrict permissive RLS policies
-- ============================================================================
-- This migration hardens overly permissive RLS policies on system/audit tables.
-- Reference: sql-setup/00-security-helpers-reference.sql
-- ============================================================================

-- ============================================================================
-- 1. email_automation_log - Restrict INSERT/UPDATE to Vivacity staff
-- ============================================================================
-- Current: Any authenticated user can INSERT/UPDATE
-- Fixed: Only Vivacity staff can INSERT/UPDATE (system automation runs as service_role)

DROP POLICY IF EXISTS "System can insert automation logs" ON public.email_automation_log;
DROP POLICY IF EXISTS "System can update automation logs" ON public.email_automation_log;

-- Staff can insert automation logs (service_role bypasses RLS for edge functions)
CREATE POLICY "staff_insert_automation_logs" ON public.email_automation_log
FOR INSERT TO authenticated
WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

-- Staff can update automation logs
CREATE POLICY "staff_update_automation_logs" ON public.email_automation_log
FOR UPDATE TO authenticated
USING (public.is_vivacity_team_safe(auth.uid()))
WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

-- ============================================================================
-- 2. notification_schedule - Replace broad ALL policy with granular access
-- ============================================================================
-- Current: "System can manage notification_schedule" uses USING (true)
-- Fixed: Granular policies for each operation

DROP POLICY IF EXISTS "System can manage notification_schedule" ON public.notification_schedule;

-- Staff can manage all notifications
CREATE POLICY "staff_manage_notifications" ON public.notification_schedule
FOR ALL TO authenticated
USING (public.is_vivacity_team_safe(auth.uid()))
WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

-- Users can insert their own notifications
CREATE POLICY "users_insert_own_notifications" ON public.notification_schedule
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can update their own notifications
CREATE POLICY "users_update_own_notifications" ON public.notification_schedule
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Users can delete their own notifications
CREATE POLICY "users_delete_own_notifications" ON public.notification_schedule
FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- ============================================================================
-- 3. oauth_states - Document intentional permissiveness (no policy changes)
-- ============================================================================
-- NOTE: oauth_states policies are intentionally permissive because:
-- 1. OAuth flow requires state creation before authentication completes
-- 2. States are short-lived (expire quickly)
-- 3. Service role (edge functions) bypasses RLS anyway
-- 4. No sensitive data stored - only temporary flow state
--
-- Existing policies:
-- - oauth_states_insert: WITH CHECK (true) - Required for OAuth initiation
-- - oauth_states_select: USING (true) - Required for OAuth callback verification
-- - oauth_states_delete: USING (true) - Required for cleanup
-- - Service role can manage oauth states: USING (true) - For edge functions
--
-- This is ACCEPTABLE and BY DESIGN. No changes needed.

-- Add comment to table documenting this decision
COMMENT ON TABLE public.oauth_states IS 
'Temporary OAuth flow state storage. RLS is intentionally permissive because:
1. OAuth flow requires state creation before authentication completes
2. States are short-lived and expire quickly
3. Edge functions use service_role which bypasses RLS
4. No sensitive data stored - only temporary flow identifiers';

-- ============================================================================
-- 4. Audit tables - Document intentional INSERT permissiveness
-- ============================================================================
-- email_link_audit, eos_minutes_audit_log, package_workflow_logs
-- These tables have WITH CHECK (true) for INSERT which is acceptable for audit logging.
-- The pattern allows any authenticated user to create audit records, but SELECT is restricted.

COMMENT ON TABLE public.email_link_audit IS 
'Email link tracking audit log. INSERT is permissive (WITH CHECK true) to allow 
system-wide audit logging. SELECT restricted to record owner or SuperAdmin.';

COMMENT ON TABLE public.eos_minutes_audit_log IS 
'EOS meeting minutes audit trail. INSERT is permissive (WITH CHECK true) to allow 
system-wide audit logging. SELECT restricted to tenant members.';

COMMENT ON TABLE public.package_workflow_logs IS 
'Package workflow state change audit log. INSERT is permissive (WITH CHECK true) 
to allow system-wide audit logging. SELECT restricted to tenant members or SuperAdmin.';