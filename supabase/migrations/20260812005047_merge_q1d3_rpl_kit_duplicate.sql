-- Consolidates "Q1.D3-RPL VET Student and Assessor Kit", previously
-- duplicated as one row per package (id 7567 for KS-RTO, id 7582 for
-- M-GC), onto the canonical row 7582 -- latest id, SharePoint-linked, and
-- more recently maintained (both already share the same category/
-- framework). Both serve different real client populations, so instances
-- are migrated, not dropped.
--   1. Repoint KS-RTO's stage_documents link from 7567 to 7582.
--   2. Migrate 7567's document_instances to 7582 (verified zero
--      stageinstance_id conflicts).
--   3. Remove the now-unreferenced document row 7567 (verified zero rows
--      in document_versions beyond the initial version, document_files,
--      document_data_sources, document_source_mappings,
--      client_stage_documents, generated_documents,
--      governance_document_deliveries, audit_inspection).
-- See docs/audit-log/entries/2026-08-12-manage-documents-duplicate-cleanup.md.
UPDATE stage_documents SET document_id = 7582 WHERE document_id = 7567;
UPDATE document_instances SET document_id = 7582 WHERE document_id = 7567;
DELETE FROM documents WHERE id = 7567;
