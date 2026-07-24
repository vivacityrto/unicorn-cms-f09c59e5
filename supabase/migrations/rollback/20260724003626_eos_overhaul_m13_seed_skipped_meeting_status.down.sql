-- ============================================================
-- Rollback for 20260724003626_eos_overhaul_m13_seed_skipped_meeting_status.sql
-- Removes the 'skipped' dd_meeting_status row. Safe only if no
-- eos_meetings row has been set to status = 'skipped' yet - the RESTRICT
-- FK will block this delete otherwise, which is the correct behavior
-- (don't orphan real skipped-meeting data on a rollback).
-- ============================================================

BEGIN;

DELETE FROM public.dd_meeting_status WHERE value = 'skipped';

COMMIT;
