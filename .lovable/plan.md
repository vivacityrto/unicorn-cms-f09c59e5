

## Fix: Notes HTML Rendering + Package Update on Edit

### Problem 1: Raw HTML in View Dialog
The View Note dialog (line 1347) renders `note_details` as plain text via `{selectedNote.note_details}`, showing raw HTML tags instead of formatted content.

### Problem 2: Package not updated on edit
When editing a note and changing the package dropdown, `handleSave` (line 502) passes `package_id` to `updateNote` but does NOT update `parent_type` or `parent_id`. The note stays associated with its original parent. The `UpdateNoteInput` interface also lacks `parent_type` and `parent_id` fields.

### Changes

**File: `src/hooks/useNotes.tsx`**
- Add `parent_type` and `parent_id` to the `UpdateNoteInput` interface so the update can reassign the note's parent.

**File: `src/components/client/ClientStructuredNotesTab.tsx`**

1. **View Dialog** (line 1292): Change `max-w-lg` to `max-w-2xl`.

2. **View Dialog content** (lines 1347-1349): Replace plain text rendering with `dangerouslySetInnerHTML` using `sanitizeHtml()` from `@/lib/sanitize`, wrapped in `prose prose-sm dark:prose-invert max-w-none` classes.

3. **handleSave edit path** (lines 501-512): When updating, also pass `parent_type` and `parent_id` based on the selected package:
   - If a package is selected: `parent_type: 'package_instance'`, `parent_id: selectedPkg.instance_id`
   - If "None" is selected: `parent_type: 'tenant'`, `parent_id: tenantId`

This ensures changing the package dropdown during edit actually moves the note to the new parent.

