-- ============================================================
-- Rollback for 20260723070351_eos_overhaul_m7_rls_permissions.sql
-- ============================================================

BEGIN;

DROP POLICY IF EXISTS eos_configuration_segments_manage_write ON public.eos_configuration_segments;
DROP POLICY IF EXISTS eos_configuration_segments_staff_read ON public.eos_configuration_segments;
DROP POLICY IF EXISTS eos_configurations_manage_write ON public.eos_configurations;
DROP POLICY IF EXISTS eos_configurations_staff_read ON public.eos_configurations;

DELETE FROM public.role_permissions WHERE feature_key = 'eos.configurations.manage';

DROP FUNCTION IF EXISTS public.has_permission(text, text);

NOTIFY pgrst, 'reload schema';

COMMIT;
