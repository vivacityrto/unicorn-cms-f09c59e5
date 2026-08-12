-- Consolidates "Rectification Table of Contents", previously duplicated
-- across three packages (id 5422 CHC/Finalise client, id 5535 KS-CRI/Mock
-- Audit, id 5538 DD/Finalise client), onto canonical row 5538 (latest id,
-- no distinguishing metadata -- all uncategorised, no SharePoint link).
--   1. Repoint both stage_documents links (5422, 5535) to 5538.
--   2. Migrate document_instances: 5422 had zero, 5535's 278 migrated to
--      5538 (verified zero stageinstance_id conflicts).
--   3. Remove the now-unreferenced document rows 5422, 5535 (verified
--      zero rows in document_versions beyond each's initial version,
--      document_files, document_data_sources, document_source_mappings,
--      client_stage_documents, generated_documents,
--      governance_document_deliveries, audit_inspection).
-- See docs/audit-log/entries/2026-08-12-manage-documents-duplicate-cleanup.md.
UPDATE stage_documents SET document_id = 5538 WHERE document_id IN (5422, 5535);
UPDATE document_instances SET document_id = 5538 WHERE document_id IN (5422, 5535);
DELETE FROM documents WHERE id IN (5422, 5535);
