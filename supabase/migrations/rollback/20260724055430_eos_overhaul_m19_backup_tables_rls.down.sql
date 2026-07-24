-- ============================================================
-- Rollback for 20260724055430_eos_overhaul_m19_backup_tables_rls.sql
-- Disables RLS on the three backup tables again. Only meaningful if
-- these tables still exist - they're scheduled for deletion after
-- 2026-10-23 per their own table comments, at which point this
-- rollback becomes a no-op (ALTER TABLE on a dropped table would error,
-- so check existence first if running this after that date).
-- ============================================================

BEGIN;

ALTER TABLE public._eos_template_backfill_20260723 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public._eos_template_versions_backfill_20260723 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public._eos_retired_type_templates_backfill_20260723 DISABLE ROW LEVEL SECURITY;

COMMIT;
