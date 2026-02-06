-- ============================================================================
-- AUDIT TABLE RLS HARDENING
-- ============================================================================
-- These are audit/logging tables where INSERT operations need to be allowed
-- but should be constrained to prevent spoofing of the actor identity.
-- ============================================================================

-- 1. email_link_audit - No user_id column, restrict to staff
DROP POLICY IF EXISTS "email_link_audit_insert" ON public.email_link_audit;

CREATE POLICY "staff_insert_email_link_audit" 
ON public.email_link_audit 
FOR INSERT 
TO authenticated
WITH CHECK (public.is_vivacity_team_safe(auth.uid()));

COMMENT ON TABLE public.email_link_audit IS 
'Audit log for email link clicks. INSERT restricted to Vivacity staff.';

-- 2. eos_minutes_audit_log - Has user_id column, constrain to self
DROP POLICY IF EXISTS "System can insert minutes audit logs" ON public.eos_minutes_audit_log;

CREATE POLICY "users_insert_own_minutes_audit" 
ON public.eos_minutes_audit_log 
FOR INSERT 
TO authenticated
WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.eos_minutes_audit_log IS 
'Audit log for EOS minutes changes. Users can only insert records for themselves.';

-- 3. package_workflow_logs - Has created_by column, constrain to self
DROP POLICY IF EXISTS "System can insert logs" ON public.package_workflow_logs;

CREATE POLICY "users_insert_own_workflow_logs" 
ON public.package_workflow_logs 
FOR INSERT 
TO authenticated
WITH CHECK (created_by = auth.uid());

COMMENT ON TABLE public.package_workflow_logs IS 
'Audit log for package workflow events. Users can only insert records for themselves.';