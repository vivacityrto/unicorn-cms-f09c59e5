-- ============================================================
-- Rollback for 20260723063944_eos_overhaul_m4_data_cleanup_non_6372_templates.sql
-- Restores deleted rows from the backup tables. Run BEFORE M5's rollback
-- if both need reverting (M5 drops the versions table entirely; this
-- expects that table to already exist when it runs, i.e. rollback order
-- is reverse of apply order: M5 down, then M4 down).
-- Does not drop the backup tables themselves — keep for audit trail.
-- ============================================================

BEGIN;

INSERT INTO public.eos_agenda_templates
SELECT * FROM public._eos_template_backfill_20260723;

INSERT INTO public.eos_agenda_template_versions
SELECT * FROM public._eos_template_versions_backfill_20260723;

NOTIFY pgrst, 'reload schema';

COMMIT;
