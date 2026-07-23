-- ============================================================
-- Rollback for 20260723063428_eos_overhaul_m2_backfill_configurations.sql
-- Deletes the 4 tenant-6372 Configuration rows; CASCADE removes their
-- segment rows. Source tables (eos_agenda_templates, eos_meeting_series)
-- are untouched by M2, so nothing else needs restoring.
-- ============================================================

BEGIN;

DELETE FROM public.eos_configurations
WHERE tenant_id = 6372 AND meeting_type IN ('L10', 'Quarterly', 'Annual', 'Same_Page');

NOTIFY pgrst, 'reload schema';

COMMIT;
