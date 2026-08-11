-- Second pass of the Manage Documents duplicate cleanup (see
-- docs/audit-log/entries/2026-08-12-manage-documents-duplicate-cleanup.md).
-- Removes 26 duplicate-by-title-and-format documents with no stage link
-- (16 with a properly stage-linked twin already live elsewhere, plus 10
-- fully orphaned with no linked counterpart at all). Verified before
-- deletion: zero rows across document_instances, document_versions (beyond
-- the initial version), client_stage_documents, generated_documents,
-- governance_document_deliveries, audit_inspection, document_files, and
-- document_data_sources for all 26. One (id 80) has a source_template_url,
-- confirmed to point at the exact same SharePoint file already linked on
-- its kept twin (id 7204) -- a redundant earlier import, not a distinct
-- document.
DELETE FROM documents
WHERE id IN (3,8,9,10,11,12,13,17,22,23,24,62,63,64,65,77,79,80,83,86,87,88,91,92,93,95);
