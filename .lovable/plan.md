
## Scope
Rework the "Create Document" flow on Manage Documents so a SharePoint template file is picked first, then metadata is prefilled from it. Also broaden the "Ready" file-status derivation. No DB migrations, no changes to CreateDocumentDialog2 or tenant-scoped flows.

## 1. Extract shared SharePoint browser component

Create `src/components/documents/SharePointTemplateBrowser.tsx` — a presentational browser that owns the browse/breadcrumbs/filter/select UI but not the import call.

- Props: `open`, `initialFilter?`, `autoNavigateToFolder?` (used by governance), `onFileSelected(file, driveId, currentFolderName)`, plus optional slot for footer (or expose selection via controlled prop). Simpler: expose it as a section (not a modal) so both callers can embed it inside their own dialog step.
- Signature: `<SharePointTemplateBrowser initialFilter={...} autoNavigateToFolder={...} onSelectionChange={(sel) => ...} />` where `sel = { file, driveId, currentFolderName } | null`.
- Encapsulates the state currently in GovernanceImportDialog lines 47–172: `items`, `loading`, `driveId`, `selectedFile`, `breadcrumbs`, `filterText`, auto-navigation to a target folder (generalised from the framework map — caller passes folder name directly).
- `currentFolderName` = last breadcrumb entry's `name` at time of selection.

Refactor `GovernanceImportDialog.tsx` to render `<SharePointTemplateBrowser>` for the browse portion; keep its own import call, post-import result UI, and modal chrome. Preserve existing framework-folder auto-nav by passing the mapped folder name into `autoNavigateToFolder`.

## 2. Two-step Create Document dialog in ManageDocuments.tsx

Refactor the existing Dialog (starting at line 1128) into a two-step flow, only when creating (not editing — leave the edit path untouched). Introduce local state `createStep: 'browse' | 'metadata'` and `selectedTemplate: { file, driveId, folderName } | null`.

Step 1 — Browse (default when opening for a new doc):
- Header switches to "Select Template File".
- Renders `<SharePointTemplateBrowser>` inside the existing DialogContent body.
- Footer: Cancel + "Next" (disabled until a file is selected). On Next, derive prefill values and advance to `metadata`.

Prefill derivation:
- `title`: selected file name with extension stripped (`name.replace(/\.[^./\\]+$/, '')`).
- `format`: from extension (map common ones: docx → "Word", xlsx → "Excel", pdf → "PDF", pptx → "PowerPoint"; fall back to uppercased extension). Preserves existing string field.
- `categories`: look up `dd_document_categories` row where `sharepoint_folder_name` matches `selectedTemplate.folderName` (case-insensitive). If found, set `categories: [value]`; otherwise leave empty.
- `description`, `versiondate`, `versionnumber`, `versionlastupdated`: untouched (blank).

Step 2 — Metadata:
- Renders the existing metadata form (lines 1167+). Hide the raw file-upload branch that currently lives in this create path (leave the edit-mode uploader alone).
- Add a "Back" button in the footer that returns to `browse` (keeps current selection so user sees their choice preselected).
- Save button label stays "Create". Disabled unless required fields present (existing checks).

Edit mode:
- When `editingDocumentId` is set, skip Step 1 entirely and render the metadata form as today. All existing edit logic preserved.

## 3. Category fetch update

Update the `fetchCategories` query at line 260 from `select("value, label")` to `select("value, label, sharepoint_folder_name")`, keep the current mapped shape but also expose `sharepoint_folder_name` on entries (extend the local `Category`/state typing accordingly). Only used by prefill lookup; existing consumers unaffected because they read `id`/`name`.

Assumption: `dd_document_categories.sharepoint_folder_name` already exists (user says "add this column to the existing categories fetch" — i.e. add it to the SELECT, not the schema). If the column does not exist, the query will error and we'll pause to confirm before adding a migration (the prompt explicitly forbids migrations here).

## 4. Confirm/create logic

Refactor `handleCreateDocument` create-branch:
1. Insert `documents` row using current metadata (same fields it uses today, minus local file uploads).
2. Call `import-sharepoint-template` with `{ action: 'import', document_id: newDoc.id, source_drive_id: selectedTemplate.driveId, source_item_id: selectedTemplate.file.id }`.
3. On success: show existing success toast + merge-field scan result panel (reuse the same result UI shape as GovernanceImportDialog — extract as a small inline component or duplicate the JSX block). Close dialog after user dismisses / auto-close on toast is fine, matching current post-create UX; keep it simple: toast with version + linked/invalid tag counts, then close.
4. On step-2 import failure: keep dialog open on the metadata step (or a small "Retry import" state), show error toast, do NOT delete the created document. Provide a "Retry import" button that re-invokes the edge function with the same payload, and a "Close" button that dismisses (leaving the doc as Needs Upload, refreshed via `fetchDocuments()`).

Edit branch of `handleCreateDocument`: unchanged.

## 5. Ready counter fix (lines 424–447)

Broaden `file_status = 'file_ready'` to include documents that have any of:
- a `document_files` row (existing), OR
- any `document_versions` row for that `document_id`, OR
- a non-null `documents.source_template_url` on the doc itself.

Implementation:
- Add a second query alongside the existing `document_files` fetch: `supabase.from('document_versions').select('document_id').in('document_id', docIds)`; build `versionsSet`.
- In the enrichment map, treat `readySet.has(id) || versionsSet.has(id) || !!doc.source_template_url` as `file_ready`. Retain `legacy_only` and `needs_upload` fallbacks.
- Ensure `source_template_url` is included in the `documents` select (verify current select includes it; if not, add it).

## Out of scope (per prompt)
- CreateDocumentDialog2 and tenant/package-scoped flows.
- Database migrations, new tables, or RLS changes.
- Bulk-linking tool for existing documents.

## Files touched
- `src/components/documents/SharePointTemplateBrowser.tsx` (new)
- `src/components/governance/GovernanceImportDialog.tsx` (refactor to use shared component)
- `src/pages/ManageDocuments.tsx` (category select, two-step dialog, create/import wiring, file_status calc)
