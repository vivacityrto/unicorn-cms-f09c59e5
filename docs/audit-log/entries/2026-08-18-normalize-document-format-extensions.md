# Audit: 2026-08-18 — normalize-document-format-extensions

**Trigger:** ad-hoc
**Scope:** Manage Documents template-format capture and governance-document delivery filenames; existing friendly-label format metadata. Did not modify SharePoint files already delivered.

## Findings
- Manage Documents persisted display labels such as `Excel` and `Word` in `documents.format`, although the delivery function treats that field as a filename extension and processor selector.
- Two genuine `.xlsx` templates added on 2026-08-17 were delivered to SharePoint as `.excel`; the same path would have produced `.word` for newly imported Word templates.
- All 61 production `Word` records have a `.docx` version file and both production `Excel` records have an `.xlsx` version file.

## KB changes shipped
- no changes

## Code changes (if this entry accompanies one)
- `deliver-governance-document` v440: infer the delivery format from the version filename and normalize historic friendly labels as a fallback.
- `20260818090000_normalize_document_format_extensions.sql`: normalized 61 `Word` records to `docx` and two `Excel` records to `xlsx` in production.
- Pending commit: persist canonical extensions at import so new records do not recreate the defect.

## Decisions
- `documents.format` is machine metadata and must store a canonical file extension. UI labels are derived separately.
- The version filename is authoritative during delivery, allowing historic metadata defects to be recovered safely.

## Open questions parked
- Existing `.excel` SharePoint files should be regenerated after the production data backfill; this session does not rename or overwrite client files.
