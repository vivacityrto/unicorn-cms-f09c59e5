-- ============================================================
-- EOS Meeting Overhaul — Migration 4 (Data-only cleanup)
-- Hand-authored hotfix, applied via explicit override (root CLAUDE.md,
-- 2026-07-23). DATA ONLY — no schema/structural change (that's M5).
-- Apply in the 22:00-04:00 AEST off-peak window per project convention.
--
-- Dry-run (read-only, run live 2026-07-23) confirmed:
--   - 2037 eos_agenda_templates rows exist outside tenant 6372
--   - 0 eos_meeting_series rows outside 6372 reference any template
--   - 0 eos_meetings rows outside 6372 reference any template (open or closed)
--   - i.e. these are pure unused auto-seeded rows: no orphan FK pointers
--     to NULL out first, just a straightforward backup + delete.
--   - 1633 eos_agenda_template_versions rows belong to these templates;
--     backed up here too and will cascade-delete via the existing
--     ON DELETE CASCADE FK the moment their parent template is deleted.
-- ============================================================

BEGIN;

CREATE TABLE public._eos_template_backfill_20260723 AS
SELECT * FROM public.eos_agenda_templates WHERE tenant_id <> 6372;

COMMENT ON TABLE public._eos_template_backfill_20260723 IS
  'Backup of eos_agenda_templates rows outside tenant 6372, taken before deletion as part of the EOS meeting overhaul (M4, 2026-07-23). 2037 rows confirmed via live dry-run, zero referenced by any eos_meeting_series/eos_meetings row in any tenant. DROP AFTER 2026-10-23.';

CREATE TABLE public._eos_template_versions_backfill_20260723 AS
SELECT v.* FROM public.eos_agenda_template_versions v
JOIN public.eos_agenda_templates t ON t.id = v.template_id
WHERE t.tenant_id <> 6372;

COMMENT ON TABLE public._eos_template_versions_backfill_20260723 IS
  'Backup of eos_agenda_template_versions rows belonging to non-6372 templates, taken before their parent templates are deleted (M4, 2026-07-23) and before the whole versions table is dropped (M5). DROP AFTER 2026-10-23.';

DELETE FROM public.eos_agenda_templates WHERE tenant_id <> 6372;
-- cascades to eos_agenda_template_versions via its existing ON DELETE CASCADE FK

NOTIFY pgrst, 'reload schema';

COMMIT;
