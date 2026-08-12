-- Human-facing YEAR.MAJOR.MINOR version label for document_versions, distinct
-- from the existing internal `version_number` (int, still used for the
-- UNIQUE(document_id, version_number) constraint, storage paths, and
-- ordering -- unchanged). display_version is what staff actually set and
-- see; version_number stays the boring internal sequence.
--
-- Backfill sources the year from the legacy documents.versiondate field
-- (a real historical version date predating the SharePoint-versioning
-- system, populated for 522 of 538 documents, range 2014-2026) rather than
-- document_versions.created_at (which mostly reflects a 2026 bulk-import
-- timestamp, not when the document was actually last revised). Falls back
-- to document_versions.created_at's year for the 16 documents with no
-- legacy versiondate. Major/minor default to 00 for all backfilled rows --
-- there's no way to know how many real revisions preceded the current one.

alter table public.document_versions
  add column display_version text;

update public.document_versions dv
set display_version = lpad(
  date_part('year', coalesce(d.versiondate, dv.created_at::date))::int::text,
  4, '0'
) || '.00.00'
from public.documents d
where d.id = dv.document_id;

alter table public.document_versions
  add constraint document_versions_display_version_format_check
  check (display_version ~ '^\d{4}\.\d{2}\.\d{2}$');

alter table public.document_versions
  add constraint document_versions_document_id_display_version_key
  unique (document_id, display_version);

alter table public.document_versions
  alter column display_version set not null;
