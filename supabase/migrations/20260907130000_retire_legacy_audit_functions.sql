-- M3-A — retire the three obsolete audit-reminder routines after dependency
-- review and explicit product-owner approval.
-- migration-target-project: yxkgdalkbrriasiyyrwk
--
-- Jobs 4–6 were unscheduled by M2. The routines are service-role-only,
-- have no triggers/views or repository callers, and both legacy tables are
-- empty. This migration deliberately retains notification_schedule and
-- notification_audit_log until M3-B/M3-C retire their remaining Edge paths.

DROP FUNCTION IF EXISTS public.audit_flag_overdue_chcs();
DROP FUNCTION IF EXISTS public.audit_send_24hr_confirmation();
DROP FUNCTION IF EXISTS public.audit_send_evidence_reminders();
