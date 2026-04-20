

## Plan: SuperAdmin Email Template Attachment Manager

### Mounting point
Add an **Attachments** tab to `EditStageEmailDialog` (the dialog opened from `AdminStageDetail` → Emails → ✏️). This dialog edits rows in the `emails` table whose `id` (bigint) matches `email_attachments.email_id`, and exposes `email.stage_id` for the document filter — exactly what the spec needs.

The other "email templates" UI (`EmailTemplateEditorDialog` on `/manage-email-templates`) edits the separate `email_templates` table (uuid id), which has no FK relationship with `email_attachments`, so it's not the right surface here.

### New component: `EmailAttachmentsManager`
File: `src/components/stage/EmailAttachmentsManager.tsx`

Props: `{ emailId: number; stageId: number | null }`

Behaviour:
1. **List linked attachments** via React Query — same join the spec describes:
   - Fetch `email_attachments` rows for `email_id`, ordered by `order_number`.
   - Resolve `documents` (id, title, format) and most-recent `document_files.file_path` per doc (reuse the pattern from `useEmailAttachments.ts`).
   - Render rows: drag handle (`GripVertical`) | file icon (xlsx green / docx blue / generic) | title | format badge | remove button (`Trash2`).
2. **Drag-and-drop reorder** using `@dnd-kit/core` + `@dnd-kit/sortable` (already used in `SortableStaffTaskList.tsx`). On drop, batch-update `email_attachments.order_number` (1..N) and invalidate the query.
3. **Add attachment** row above the list:
   - `CommandInput`-style searchable combobox (Popover + cmdk, same pattern as `ScopeMultiSelect`) populated from:
     ```sql
     SELECT id, title, format FROM documents
     WHERE is_core = true AND stage = :stageId
     ORDER BY title
     ```
   - Excludes already-linked document IDs.
   - "Add" button inserts a new `email_attachments` row with `order_number = max+1`.
   - If `stageId` is null: show notice "This email is not associated with a stage — no core documents available to attach."
4. **Remove**: `DELETE FROM email_attachments WHERE id = :rowId` with a small confirm (reuse `ConfirmDialog`, destructive variant).
5. Read/write happens directly via `supabase` client; SuperAdmin RLS already permits this (staff bypass).

### Wire-up: `EditStageEmailDialog`
- Wrap the existing form body in `<Tabs>` with two tabs: **Details** (current content) and **Attachments** (new manager).
- Pass `emailId={email.id}` and `stageId={email.stage_id}`.
- No change to the save handler — attachments persist immediately on each action (live, not deferred to Save).

### Files
- New: `src/components/stage/EmailAttachmentsManager.tsx`
- Edit: `src/components/stage/EditStageEmailDialog.tsx` (add Tabs wrapper + render the manager)

### Out of scope / not changed
- No DB schema changes (table & FKs already exist).
- No RLS changes (staff already have full access via `is_vivacity()`).
- `useEmailAttachments.ts` (read-only hook for the Compose modal) is left untouched; the manager uses its own write-aware queries.
- The `/manage-email-templates` UI (different table) is unchanged.

