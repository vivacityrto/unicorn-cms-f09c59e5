## Finding

The latest overwrite run did process 196 document instances, but the bulk function skipped 195 with `no_template` before calling delivery.

The database shows:
- 196 stage document instances
- 196 published `document_versions`
- only 1 has a non-empty `document_versions.storage_path`
- 195 have `storage_path = ''` (blank string), so the function treats them as missing templates
- `documents.uploaded_files` also only exists for 1 document, which is why the earlier code behaved the same way

So the issue is not overwrite mode anymore, and not merge-field replacement. The issue is that most “allocated template files” are not currently materialised as local template paths in `document_versions.storage_path` / `frozen_storage_path`.

## Plan

1. **Make missing-template reporting accurate**
   - Treat blank strings as missing paths using `trim()` checks.
   - Return clearer result errors: “Published version exists but has no imported template storage path”.
   - This prevents misleading counts where blank paths look like allocated templates.

2. **Add fallback support for allocated source templates**
   - Inspect the template allocation source currently used by the UI/import flow (`source_template_url`, SharePoint import metadata, or mapping table).
   - If a document has an allocated SharePoint template but no local `storage_path`, bulk generation should either:
     - import/freeze that template first into `document_versions.storage_path`, then deliver it; or
     - fail with a precise “template allocated but not imported/published” reason.

3. **Use published version storage as the generation source of truth**
   - Keep `document_versions.storage_path` / `frozen_storage_path` as the only source used for actual document bytes.
   - Do not rely on `documents.uploaded_files` for bulk governance generation, because that only has 1 populated row in this stage.

4. **Improve diagnostics in the UI result summary**
   - Surface a separate reason for `template_not_imported` instead of grouping it with `no_template`.
   - The user will be able to see how many documents are genuinely missing templates versus allocated-but-not-imported.

5. **Validate with the same tenant/stage**
   - Re-run stage `24229` overwrite mode.
   - Expected result after import/fallback is: all documents with a real allocated source template are attempted, not skipped as `no_template`.
   - Merge replacements remain in the delivery function and should apply to each attempted DOCX/PPTX/XLSX.