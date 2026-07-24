-- ============================================================
-- Rollback for 20260723072219_eos_overhaul_m8_create_from_configuration.sql
-- Drops the new function. Does NOT remove any eos_meeting_series rows it
-- may have lazily created (those are real recurring series a rollback
-- shouldn't silently delete once meetings may already depend on them).
-- ============================================================

BEGIN;

DROP FUNCTION IF EXISTS public.create_meeting_from_configuration(text, timestamptz);

NOTIFY pgrst, 'reload schema';

COMMIT;
