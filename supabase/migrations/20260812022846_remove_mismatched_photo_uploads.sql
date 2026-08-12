-- Four documents (ids 1, 2, 4, 57) had a mismatched file attached: each
-- declares format 'docx' but the actual uploaded file is an unrelated
-- photo or logo image (staff photos, a company logo) from the original
-- Oct-Dec 2025 import batch. Confirmed via extension-vs-declared-format
-- mismatch during the "Needs Upload" investigation
-- (docs/audit-log/entries/2026-08-12-manage-documents-duplicate-cleanup.md
-- follow-up). Verified zero downstream references to these
-- document_versions rows (governance_document_deliveries,
-- documents.current_published_version_id, stage_documents.pinned_version_id)
-- before removing.
--
-- Clears the legacy uploaded_files/file_names arrays and removes the
-- incorrect document_versions row for each, so these 4 documents
-- correctly report as "Needs Upload" again instead of falsely showing
-- as "Ready" with someone's photo attached. The underlying image files
-- remain in the document-files storage bucket (now fully unreferenced)
-- -- deliberately not deleted here, since removing storage objects isn't
-- safely doable via a plain SQL migration.
DELETE FROM document_versions
WHERE id IN (
  '7d65bfc0-61a8-4b09-bdca-cc416bea872c',
  '3ae29098-a7a0-4ab8-9ed8-75d6d787a9b5',
  'b689c121-7961-4f57-b55c-760c4b5f9042',
  '821e6bc9-6af8-4ab4-acf6-0969f184aeef'
);

UPDATE documents
SET uploaded_files = NULL,
    file_names = NULL
WHERE id IN (1, 2, 4, 57);
