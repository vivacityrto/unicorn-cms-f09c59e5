## Goal
Enhance the "Link Documents from Library" dialog inside `src/components/stage/StageDocumentsPanel.tsx` with richer filtering — category, file type, framework, and SharePoint status — matching patterns already established in `AddExistingDocumentDialog.tsx` and `ManageDocuments.tsx`. Filtering-only change; selection, footer, and data model untouched.

## Changes

### `src/components/stage/StageDocumentsPanel.tsx`

1. **Extend the local `Document` interface**
   - Add `framework_type: string | null` and `source_template_url: string | null`.

2. **Extend `fetchLibraryDocs` query**
   - Select `framework_type` and `source_template_url` alongside the existing `id, title, format, category, description`.
   - No new query round-trips; existing single fetch remains.

3. **Add filter state**
   - `categoryFilter: string` (default `"all"`)
   - `fileTypeFilter: string` (default `"all"`) — values: `all | word | pdf | excel | powerpoint`, aligned with the format buckets used by `getFileTypeBadge`.
   - `frameworkFilter: string` (default `"all"`) — supports `all`, `__none__`, or a framework `value`.
   - `sharepointFilter: string` (default `"all"`) — `all | has | none`.

4. **Data hooks**
   - Use `useDocumentCategories()` for category options (same shape as `AddExistingDocumentDialog.tsx`: "All Categories" + one `SelectItem` per active category).
   - Add a `useQuery` for `dd_governance_framework` (label/value/is_active/sort_order) mirroring the query used in `ManageDocuments.tsx`; render "All frameworks", "No framework" (`__none__`), then one item per row.

5. **Extend `filteredLibraryDocs`**
   - Keep client-side filtering over already-fetched `libraryDocs`.
   - Combine all predicates with AND:
     - existing search-text match on title/category/description
     - category: match `doc.category === categoryFilter` when not `all`
     - file type: bucket `doc.format` into word/pdf/excel/powerpoint using the same logic that drives `getFileTypeBadge`, then compare
     - framework: `all` → skip; `__none__` → `!doc.framework_type`; otherwise `doc.framework_type === frameworkFilter`
     - SharePoint: `has` → `!!doc.source_template_url`; `none` → `!doc.source_template_url`

6. **Layout inside the dialog**
   - Row 1 (unchanged): full-width search `Input`.
   - Row 2 (new): responsive `flex flex-wrap gap-2` (or `grid grid-cols-2 md:grid-cols-4`) containing the four shadcn `Select`s in this order — Category, File Type, Framework, SharePoint. Styling matches existing shadcn selects already in this dialog/file.
   - "Clear filters" — small ghost/link `Button` shown only when any of the four dropdowns is non-default OR the search input is non-empty; resets all filter state to defaults.
   - Scrollable document list below remains as-is.

7. **No changes** to:
   - The category taxonomy or persistence.
   - Row checkbox/selection state.
   - The "Link N Documents" footer button and its handler.
   - `getFileTypeBadge` implementation (only its bucket boundaries are reused for the file-type filter).

## Verification
- Type-check the modified file.
- Manually walk the dialog: each dropdown narrows results; combined filters intersect correctly; "Clear filters" appears only when active and restores the full list; selection state persists across filter changes (since selection lives outside `filteredLibraryDocs`).