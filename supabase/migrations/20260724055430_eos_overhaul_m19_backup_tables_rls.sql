-- ============================================================
-- EOS Meeting Overhaul — Migration 19 (backup tables RLS)
-- Hand-authored hotfix, applied via explicit override (root CLAUDE.md,
-- 2026-07-23). Applied live 2026-07-24 immediately after M1-M18, as a
-- direct follow-up to the post-apply security advisor check below —
-- recorded here to keep the migration history matching what actually
-- ran against production.
--
-- Gap found by the mandatory post-apply Supabase security advisor
-- check: M4/M5's three backup tables (created to preserve deleted rows,
-- per their own "DROP AFTER 2026-10-23" comments) were left with RLS
-- disabled - flagged ERROR by the linter (public schema + RLS off =
-- potential PostgREST exposure). Enable RLS with zero policies
-- (deny-all), matching the exact pattern this whole overhaul already
-- uses for a table with no real access model needed (M1's
-- eos_configurations before M7's policies landed) - only
-- superuser/service_role ever needs to read a backup table.
-- ============================================================

BEGIN;

ALTER TABLE public._eos_template_backfill_20260723 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._eos_template_versions_backfill_20260723 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._eos_retired_type_templates_backfill_20260723 ENABLE ROW LEVEL SECURITY;

COMMIT;
