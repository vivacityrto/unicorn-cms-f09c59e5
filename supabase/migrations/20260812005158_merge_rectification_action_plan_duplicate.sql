-- Consolidates "Rectification Action Plan", previously duplicated across
-- three packages/stages (id 5531 KS-CRI/ASQA Audit, id 5533 KS-CRI/Mock
-- Audit, id 5537 DD/Finalise client), onto canonical row 5537 (latest id,
-- no distinguishing metadata among the three -- all uncategorised, no
-- SharePoint link). All three serve real client populations, so instances
-- are migrated, not dropped.
--   1. Repoint both stage_documents links (5531, 5533) to 5537.
--   2. Migrate both 5531's and 5533's document_instances to 5537
--      (verified zero stageinstance_id conflicts across all pairs).
--   3. Remove the now-unreferenced document rows 5531, 5533 (verified
--      zero rows in document_versions beyond each's initial version,
--      document_files, document_data_sources, document_source_mappings,
--      client_stage_documents, generated_documents,
--      governance_document_deliveries, audit_inspection).
-- See docs/audit-log/entries/2026-08-12-manage-documents-duplicate-cleanup.md.
UPDATE stage_documents SET document_id = 5537 WHERE document_id IN (5531, 5533);
UPDATE document_instances SET document_id = 5537 WHERE document_id IN (5531, 5533);
DELETE FROM documents WHERE id IN (5531, 5533);
