-- 5 documents from the 20 Jul 2026 import batch had their real version
-- embedded in the SharePoint filename itself (e.g.
-- "Q1.D4-Facilities-Resources-and-Equipment-Policy-2026.03.00.docx") which
-- the original display_version backfill ignored -- it only used
-- documents.versiondate's year with major/minor defaulted to 00, since that
-- was the reliable historical signal for the other 533 documents. Carl
-- spotted the mismatch live (filename said 2026.03.00, UI showed
-- 2026.00.00) and asked for these 5 to be corrected to match.

update document_versions
set display_version = '2026.03.00'
where document_id in (7607, 7625, 7626, 7627, 7628)
  and display_version = '2026.00.00';
