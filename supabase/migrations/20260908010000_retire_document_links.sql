-- Phase 2.6 stabilization Packet P6-B — retire the never-adopted SharePoint
-- document-link feature after Carl's explicit authorization (2026-09-08).
--
-- document_links has 0 rows, ever, in production. The frontend UI that wrote
-- to it (LinkedDocumentsList.tsx, SharePointDocumentPicker.tsx,
-- useDocumentLinks.tsx) was already retired 2026-09-07 (Phase 2.6 P6-B,
-- see docs/kb/reference/dead-code-feature-consolidation-investigation-2026-09-04.md
-- section 3.2 "SharePoint document-link UI"). The live document-stage-linking
-- feature uses the differently-named document_stage_links table instead
-- (678 real rows) and is untouched by this migration.
--
-- Confirmed before writing this migration:
--   - document_links: 0 rows.
--   - document_link_audit (its only dependent, FK'd child table): 0 rows.
--   - No cron job references either table or the link-sharepoint-document
--     Edge Function.
--   - No other table's FK references either table.
--   - update_document_links_updated_at is a trigger function used only by
--     document_links's own updated_at trigger — safe to drop alongside it.
--   - merge_tenants() references both table names in a generic, defensive
--     per-table loop wrapped in BEGIN/EXCEPTION WHEN OTHERS — it will log a
--     harmless "<table>_error" entry for these two names on future merges
--     instead of failing; not modified by this migration since it does not
--     break.
--
-- This migration does NOT touch document_stage_links, documents,
-- document_versions, document_instances, or any other document_* table —
-- only the exact two tables and one trigger function named below.
--
-- migration-target-project: yxkgdalkbrriasiyyrwk

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'document_links'
  ) THEN
    RAISE NOTICE 'P6-B document_links retirement: document_links already absent in this environment';
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.document_links LIMIT 1) THEN
    RAISE EXCEPTION 'P6-B document_links retirement refused: document_links has rows in this environment';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'document_link_audit'
  ) AND EXISTS (SELECT 1 FROM public.document_link_audit LIMIT 1) THEN
    RAISE EXCEPTION 'P6-B document_links retirement refused: document_link_audit has rows in this environment';
  END IF;

  DROP TABLE IF EXISTS public.document_link_audit;
  DROP TABLE IF EXISTS public.document_links;
  DROP FUNCTION IF EXISTS public.update_document_links_updated_at();

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('document_links', 'document_link_audit')
  ) THEN
    RAISE EXCEPTION 'P6-B document_links retirement postflight failed: a target table still exists';
  END IF;

  RAISE NOTICE 'P6-B: retired document_links, document_link_audit, and update_document_links_updated_at() — document_stage_links and all other document_* tables are untouched';
END
$$;
