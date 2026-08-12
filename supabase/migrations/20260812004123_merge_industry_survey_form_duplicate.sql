-- Consolidates "Industry Survey Form", previously duplicated as one row
-- per package (id 1286 for CHC, id 1288 for KS-RTO), onto the
-- better-maintained row (1286: properly categorized q1-training_assessment
-- /RTO, 26 real client instances) rather than the latest id, since 1288
-- is an uncategorised, never-instantiated (0 instances) copy -- applying
-- the usual "latest id" rule here would have downgraded the surviving
-- row's data quality for no benefit. Carl confirmed keeping 1286.
--   1. Repoint KS-RTO's stage_documents link from 1288 to 1286.
--   2. No document_instances migration needed -- 1288 had zero.
--   3. Remove the now-unreferenced document row 1288 (verified zero rows
--      in document_versions beyond the initial version, document_files,
--      document_data_sources, document_source_mappings,
--      client_stage_documents, generated_documents,
--      governance_document_deliveries, audit_inspection).
-- See docs/audit-log/entries/2026-08-12-manage-documents-duplicate-cleanup.md.
UPDATE stage_documents SET document_id = 1286 WHERE document_id = 1288;
DELETE FROM documents WHERE id = 1288;
