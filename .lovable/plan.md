## Problem

Templates live in SharePoint (Master Documents site), not in Supabase storage. For tenant 6372 / stage 24229 the database shows 196 document instances, 23 of which have `documents.source_template_url` set (matches the user's "24 allocated"), but only 1 has been imported into Supabase storage.

Today both `bulk-generate-phase-documents` and `deliver-governance-document` require a `document_versions` row with a non-empty `storage_path` in the Supabase `document-files` bucket. That is why only 1 file is generated and 22 are reported as `template_not_imported`.

The intent is: pull the template bytes directly from SharePoint at generate time, run merge-field replacement in memory, then upload the result to the tenant governance folder. No intermediate "import into Supabase storage" step.

## Plan

### 1. Add a SharePoint sharing-URL resolver
File: `supabase/functions/_shared/graph-app-client.ts`

- New helper `resolveDriveItemFromSharingUrl(url)` calling Graph `/shares/u!{base64url(url)}/driveItem`, returning `{ driveId, itemId, name }`.
- Reuses existing app-only auth in this module.

### 2. Refactor the template loader in `deliver-governance-document`
File: `supabase/functions/deliver-governance-document/index.ts`

Replace the strict `storage_path` requirement with a fallback chain:
1. If the version has `frozen_storage_path` / `storage_path` in Supabase storage, download from the `document-files` bucket (legacy path; still works for the 1 imported doc).
2. Otherwise read `documents.source_template_url` for the source document, resolve it via the new Graph helper, and download bytes with `graphDownload(driveId, itemId)`.
3. Only fail with "no template" if neither source is available.

Merge-field processing (DOCX / XLSX / PPTX) and the upload to the tenant governance folder are unchanged.

### 3. Relax eligibility in `bulk-generate-phase-documents`
File: `supabase/functions/bulk-generate-phase-documents/index.ts`

- Eligibility becomes: supported format AND (`document_versions.storage_path` non-empty OR `documents.source_template_url` non-empty).
- Stop requiring a published `document_versions` row when a SharePoint URL exists.
- Keep `no_template` only when the document has neither.
- Drop the `template_not_imported` reason — importing into Supabase is no longer required.
- Add per-document log of which source was used (`supabase_storage` or `sharepoint_master`).

### 4. UI cleanup
File: `src/hooks/useBulkGeneration.ts`

- Remove `template_not_imported` from the reason union and label map.

### 5. Validation

Re-run "Generate All (Overwrite)" for stage 24229 / tenant 6372.

Expected: 23 documents generated from SharePoint Master Documents into the tenant governance folder with merge fields replaced; the remaining 173 skipped as `no_template` (genuinely no SharePoint allocation).

## Out of scope

- No changes to how templates get allocated to a `documents` row.
- No schema changes, no new tables.
- The existing "import into Supabase storage + publish version" flow continues to work for legacy templates.
