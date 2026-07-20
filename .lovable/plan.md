# PPTX merge-field detection

Port existing pptx scan logic (already in `analyze-document/index.ts`) into the two edge functions that currently only handle docx/xlsx.

## 1. `supabase/functions/scan-document/index.ts`

Add a `scanPptx(fileContent: ArrayBuffer): Promise<ScanResult>` function alongside `scanDocx` and `scanXlsx`.

Behavior:
- Load the file with JSZip (same import as `scanDocx`).
- List entries matching `ppt/slides/slide*.xml` (sorted).
- For each slide XML: extract `<a:t>…</a:t>` text runs, join, run `extractMergeFields()` (the same helper already used by docx). Also strip XML tags and re-run `extractMergeFields()` as a fallback so placeholders split across text runs are still detected (mirrors the docx `replace(/<[^>]+>/g, ' ')` approach).
- Deduplicate, return `{ merge_fields, named_ranges: [], scan_method: "pptx_scan" }`.
- Wrap in try/catch returning `scan_method: "pptx_scan_error"` on failure (parallels docx).

Wire into the format branch (around lines 397-410):
- Add `const isPpt = fileName.endsWith(".pptx") || fileFormat === "powerpoint" || fileFormat === "pptx";`
- Add `else if (isPpt) { scanResult = await scanPptx(fileBuffer); }` before the unsupported-type 400.
- Keep the existing docx/xlsx branches and error message unchanged (message updated to mention .pptx).
- The existing "update `documents` row with `merge_fields`/`detected_merge_fields`" path (lines 412-438) already handles the returned ScanResult — no changes needed there. The xlsx-only `upsert_excel_template_bindings` block (line 441+) is gated by `isExcel` and stays untouched.

## 2. `supabase/functions/import-sharepoint-template/index.ts`

Extend the merge-field gate at line 206 to also cover pptx.

- Replace the `isDocx` gate with `isDocx || isPptx` where `isPptx = fileName.toLowerCase().endsWith('.pptx')`.
- Add a `scanPptxMergeFields(fileContent, documentId, supabase)` helper alongside `scanDocxMergeFields`, with the same signature and return shape (`{ detected_fields, invalid_tags, fields_linked }`).
  - Unzip via the existing `zip.ZipReader` / `BlobReader` pattern already used in `scanDocxMergeFields`.
  - Iterate entries matching `/^ppt\/slides\/slide\d+\.xml$/`.
  - For each entry decode XML, strip tags with `.replace(/<[^>]+>/g, '')` (same tactic as docx to defeat split-run splitting), accumulate into `allText`.
  - Run the same `{{tag}}` extraction, `dd_fields` lookup, and `document_fields` sync that `scanDocxMergeFields` performs — factor the shared "text → detected/invalid/linked" tail into a small helper if straightforward, otherwise duplicate.
- In the branch, call `scanDocxMergeFields` for docx and `scanPptxMergeFields` for pptx. Everything downstream (`detected_fields`, `document_template_mappings` auto-insert at lines 218-258) is format-agnostic and already works off `detected_fields`.

## Out of scope
- `deliver-governance-document` / `processPptxTemplate` — untouched.
- Frontend (`DocumentDetail.tsx`, `DocumentScanStatus.tsx`, `MergeFieldsEditor.tsx`) — untouched.
- Excel (`.xlsx`) paths in both functions — untouched.
