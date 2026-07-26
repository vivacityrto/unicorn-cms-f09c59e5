-- ============================================================
-- Rollback for 20260727020000_eos_overhaul_m21_segue_shares.sql
-- Drops the eos_segue_shares table entirely (removes it from the
-- publication implicitly via DROP TABLE).
-- ============================================================

BEGIN;

DROP TABLE IF EXISTS public.eos_segue_shares;

NOTIFY pgrst, 'reload schema';

COMMIT;
