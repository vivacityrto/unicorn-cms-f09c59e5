-- Consolidates "Delivery and Assessment Plan" (KS-RTO), previously
-- duplicated across two stages of the same package: id 1279 (Strategic
-- Business Planning, uncategorised, zero document_instances -- never
-- actually instantiated for any client) and id 6719 (Mock Audit, properly
-- categorized q1-training_assessment/RTO, SharePoint-linked, 229 real
-- historical instances). Canonical = 6719 (latest id, also the
-- well-maintained copy), per Carl's direction.
--   1. Repoint Strategic Business Planning's stage_documents link from
--      1279 to 6719.
--   2. No document_instances migration needed -- 1279 had zero.
--   3. Remove the now-unreferenced document row 1279 (verified zero rows
--      in document_versions beyond the initial version, document_files,
--      document_data_sources, document_source_mappings,
--      client_stage_documents, generated_documents,
--      governance_document_deliveries, audit_inspection).
-- See docs/audit-log/entries/2026-08-12-manage-documents-duplicate-cleanup.md.
UPDATE stage_documents SET document_id = 6719 WHERE document_id = 1279;
DELETE FROM documents WHERE id = 1279;
