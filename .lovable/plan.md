

## Plan: File status indicator + filter + inline upload

### Data fetch
In `fetchDocuments` (Super Admin / Team Leader branch), after fetching `documents`, run a second query:
```ts
const { data: files } = await supabase
  .from('document_files')
  .select('document_id')
  .in('document_id', docIds);
const readySet = new Set(files.map(f => f.document_id));
```
Attach `file_status` to each enriched doc:
- `file_ready` if `readySet.has(doc.id)`
- `legacy_only` if not ready AND `doc.uploaded_files?.length > 0`
- `needs_upload` otherwise

Add `file_status` to the `Document` interface.

### UI: status column
Add a new column (leftmost or just after ID) in the documents table — a small colored dot with tooltip:
- green `bg-emerald-500` → "File ready"
- amber `bg-amber-500` → "Legacy file only — not yet migrated to document_files"
- red `bg-red-500` → "Needs upload" (clickable, opens inline upload popover)

For `needs_upload`, dot is wrapped in a button. Clicking opens a small `Popover` containing a hidden `<input type="file">` trigger. On select:
1. Upload to storage bucket `document-files` at path `documents/{doc.id}/{timestamp}-{filename}`
2. Insert into `document_files`: `{ document_id, file_path, file_type: file.type, original_filename: file.name, file_size, uploaded_by: auth.uid() }`
3. Toast success, refetch documents (or optimistically flip status to `file_ready`)

### Filter toggle
Add a `ToggleGroup` (or 3 buttons) above the table next to existing filters:
**All | Needs Upload | Ready** — default `all`.

State: `const [fileStatusFilter, setFileStatusFilter] = useState<'all'|'needs_upload'|'ready'>('all')`.

In `applyFiltersAndSort`, add:
```ts
if (fileStatusFilter === 'needs_upload') filtered = filtered.filter(d => d.file_status === 'needs_upload');
else if (fileStatusFilter === 'ready') filtered = filtered.filter(d => d.file_status === 'file_ready');
```
Add `fileStatusFilter` to the effect dependency array.

Show counts in the toggle labels: `Needs Upload (541)`, `Ready (0)` — derived from `documents.filter(...).length`.

### Files changed
- `src/pages/ManageDocuments.tsx` — extend `Document` interface, augment `fetchDocuments` with the document_files lookup, add filter state + toggle UI, add status-dot column, add inline upload Popover handler.

### Out of scope
- No DB schema changes (`document_files` already exists with all required columns).
- No RLS work — staff already have full access via `is_vivacity()`; storage bucket `document-files` already exists.
- Migration of legacy `uploaded_files` → `document_files` is intentionally not automated here; the amber state simply flags them for the team to action manually.

