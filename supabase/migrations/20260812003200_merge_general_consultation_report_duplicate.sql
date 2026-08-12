-- Consolidates "General Consultation Report", previously duplicated as
-- one row per package (id 5519 for KS-CRI, id 5536 for DD), onto a single
-- canonical row (5536, latest id, per Carl's direction). Both serve
-- different real client populations, so instances are migrated, not
-- dropped.
--   1. Repoint KS-CRI's stage_documents link from 5519 to 5536.
--   2. Migrate 5519's document_instances to 5536 (verified zero
--      stageinstance_id conflicts).
--   3. Remove the now-unreferenced document row 5519 (verified zero rows
--      in document_versions beyond the initial version, document_files,
--      document_data_sources, document_source_mappings,
--      client_stage_documents, generated_documents,
--      governance_document_deliveries, audit_inspection).
-- See docs/audit-log/entries/2026-08-12-manage-documents-duplicate-cleanup.md.
UPDATE stage_documents SET document_id = 5536 WHERE document_id = 5519;
UPDATE document_instances SET document_id = 5536 WHERE document_id = 5519;
DELETE FROM documents WHERE id = 5519;
