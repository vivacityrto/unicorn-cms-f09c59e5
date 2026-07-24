-- ============================================================
-- Rollback for 20260724074500_eos_overhaul_m20_todos_realtime_publication.sql
-- Removes eos_todos from the supabase_realtime publication again.
-- ============================================================

BEGIN;

ALTER PUBLICATION supabase_realtime DROP TABLE public.eos_todos;

COMMIT;
