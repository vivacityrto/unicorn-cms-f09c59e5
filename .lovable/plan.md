

## Plan: Improve Add Note Dialog Layout and Functionality

### Changes Required

**1. Insert Link capability in Notes content**
- Replace the plain `<Textarea>` for note content with the existing `<RichTextEditor>` component (`src/components/ui/rich-text-editor.tsx`), which already supports link insertion via its toolbar.
- Reduce the editor's `min-h` from `500px` to something more compact (e.g., `200px`) to fit the dialog context.

**2. Reduce Notify section size and compact layout**
- Shrink the Notify user buttons: use `size="xs"` styling with smaller text (`text-xs`), smaller avatars (`h-4 w-4`), and tighter padding.
- Reduce the section label font size.

**3. Active users only in Notify**
- Already filtering `archived = false` in `useVivacityTeamUsers`. Add `.eq('disabled', false)` to the query to also exclude disabled users.

**4. Move action buttons to same line as "Pin this note"**
- Restructure the bottom section: put the Pin switch and the Cancel/Save buttons on the same row using `flex justify-between`.
- Remove the separate `DialogFooter` and consolidate into a single bottom bar.

### Files to Modify

| File | Change |
|------|--------|
| `src/components/client/ClientStructuredNotesTab.tsx` | Replace Textarea with RichTextEditor, compact Notify tiles, merge Pin + buttons into one row |
| `src/hooks/useVivacityTeamUsers.tsx` | Add `.eq('disabled', false)` filter |
| `src/components/ui/rich-text-editor.tsx` | Add optional `minHeight` prop to allow smaller editor in dialogs |

### Technical Details

- The `RichTextEditor` already has link insertion built in (via TipTap's Link extension).
- Content will be stored as HTML (already supported by the notes system -- `note_details` accepts HTML and rendering uses `DOMPurify`).
- The Notify buttons will use inline classes: `text-[11px] h-7 px-2 gap-1` with `h-4 w-4` avatars.
- Pin switch + footer buttons will be combined into a single `flex items-center justify-between` row at the bottom of the dialog.

