-- Consolidates "Training Needs Analysis", previously duplicated as one
-- row per package (id 1287 for CHC, id 1289 for KS-RTO), onto the
-- better-maintained row (1287: properly categorized q1-training_assessment
-- /RTO, 26 real client instances) rather than the latest id, since 1289
-- is an uncategorised, never-instantiated (0 instances) copy -- same
-- reasoning as the Industry Survey Form merge. Carl confirmed keeping
-- 1287.
--   1. Repoint KS-RTO's stage_documents link from 1289 to 1287.
--   2. No document_instances migration needed -- 1289 had zero.
--   3. Remove the now-unreferenced document row 1289 (verified zero rows
--      in document_versions beyond the initial version, document_files,
--      document_data_sources, document_source_mappings,
--      client_stage_documents, generated_documents,
--      governance_document_deliveries, audit_inspection).
-- See docs/audit-log/entries/2026-08-12-manage-documents-duplicate-cleanup.md.
UPDATE stage_documents SET document_id = 1287 WHERE document_id = 1289;
DELETE FROM documents WHERE id = 1289;
