-- Consolidates the "ASQA Audit Report" document, previously duplicated as
-- one row per package (id 5539 for DD, id 5558 for KS-CRI), onto a single
-- canonical row (5558, the higher/latest id, per Carl's direction). Unlike
-- the earlier same-stage duplicate cleanup, these two documents serve
-- different real client populations (DD vs KS-CRI clients each have their
-- own historical document_instances), so a plain delete would have
-- silently dropped DD clients' "ASQA Audit Report" checklist item. Instead:
--   1. Repoint DD's stage_documents link from 5539 to 5558.
--   2. Migrate 5539's document_instances to 5558 (verified zero
--      stageinstance_id conflicts with 5558's own instances, since DD and
--      KS-CRI are entirely separate packages/clients).
--   3. Remove the now-unreferenced document row 5539 (verified zero rows
--      in document_versions beyond the initial version, document_files,
--      document_data_sources, document_source_mappings,
--      client_stage_documents, generated_documents,
--      governance_document_deliveries, audit_inspection).
-- See docs/audit-log/entries/2026-08-12-manage-documents-duplicate-cleanup.md
-- for the broader duplicate-cleanup investigation this follows on from.
UPDATE stage_documents SET document_id = 5558 WHERE document_id = 5539;
UPDATE document_instances SET document_id = 5558 WHERE document_id = 5539;
DELETE FROM documents WHERE id = 5539;
