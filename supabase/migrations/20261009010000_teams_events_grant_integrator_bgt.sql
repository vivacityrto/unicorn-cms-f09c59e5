-- =====================================================================
-- Teams event registration — grant Integrator and BGT
--
-- Beverly and Novea run Teams webinar registration and hold the
-- Integrator and BGT roles. The foundation migration
-- (20261008010000_teams_event_registration_foundation.sql) seeded
-- teams_events.manage_registrations as 'none' for every role except
-- Super Admin; this corrective migration lifts exactly those two rows to
-- 'full'. Team Leader, CSC and CET stay 'none'.
--
-- Guarded with level = 'none' so it only ever changes the rows the
-- foundation migration seeded and never overrides a level an administrator
-- has since set by hand. Must run after the foundation migration (it does,
-- by timestamp).
--
-- ROLLBACK:
--   UPDATE public.role_permissions
--   SET level = 'none', updated_at = now()
--   WHERE feature_key = 'teams_events.manage_registrations'
--     AND role IN ('Integrator', 'BGT');
-- =====================================================================

UPDATE public.role_permissions
SET level = 'full', updated_at = now()
WHERE feature_key = 'teams_events.manage_registrations'
  AND role IN ('Integrator', 'BGT')
  AND level = 'none';
