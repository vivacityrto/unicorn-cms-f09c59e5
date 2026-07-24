-- ============================================================
-- Rollback for 20260723061939_eos_overhaul_m1_configurations_schema.sql
--
-- NOTE: this restores the pre-migration STATE (no eos_configurations/
-- eos_configuration_segments tables, no eos_config_v2 flag), not the
-- specific orphaned eos_segment_type that existed before this migration.
-- That prior type was dead cruft (wrong values, zero real usage,
-- confirmed via pg_depend) and is deliberately not recreated.
-- ============================================================

BEGIN;

ALTER TABLE public.app_settings DROP COLUMN IF EXISTS eos_config_v2;

DELETE FROM public.permission_features WHERE feature_key = 'eos.configurations.manage';

ALTER TABLE public.eos_meeting_occurrences
  DROP CONSTRAINT IF EXISTS eos_meeting_occurrences_status_check;
ALTER TABLE public.eos_meeting_occurrences
  ADD CONSTRAINT eos_meeting_occurrences_status_check
  CHECK (status IN ('scheduled','cancelled','completed'));

DROP TRIGGER IF EXISTS trg_eos_configuration_segments_updated_at ON public.eos_configuration_segments;
DROP TRIGGER IF EXISTS trg_eos_configurations_updated_at ON public.eos_configurations;

DROP TABLE IF EXISTS public.eos_configuration_segments;
DROP TABLE IF EXISTS public.eos_configurations;

DROP TYPE IF EXISTS public.eos_segment_type;

NOTIFY pgrst, 'reload schema';

COMMIT;
