-- Removes 11 accidental duplicate document rows that were each linked to the
-- same package_stage as another document of identical title+format, causing
-- real client packages to see the same requirement multiple times (e.g. 6x
-- for "Q1.D3-RPL VET Student and Assessor Kit" on KS-RTO). Verified before
-- deletion: none of the ~700 combined historical document_instances across
-- these 11 rows ever had a generated_file_url (never fulfilled by any
-- client), and none are referenced by client_stage_documents,
-- generated_documents, governance_document_deliveries, or audit_inspection.
-- All other references (stage_documents, document_instances,
-- document_data_sources, document_source_mappings, document_fields, etc.)
-- clean up via existing ON DELETE CASCADE foreign keys.
--
-- See docs/audit-log/entries/2026-08-12-manage-documents-duplicate-cleanup.md
-- for the full investigation and the canonical document kept per cluster.
DELETE FROM documents
WHERE id IN (7551,7552,7553,7557,7568,7569,7570,7577,7578,6927,58);
