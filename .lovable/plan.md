

## Open Linked Note Directly from Time Entries

### Problem
Clicking the note icon on a time entry navigates to `/tenant/{id}/notes` (the full list) instead of opening the specific linked note in the editor.

### Solution

**1. `src/components/client/ClientTimeTab.tsx`**
- Change the navigate URL from `/tenant/${tenantId}/notes` to `/tenant/${tenantId}/notes?editNoteId={noteId}` using the linked note's ID from `linkedNoteMap[entry.id].id`.

**2. `src/pages/TenantNotes.tsx`**
- Add a `useEffect` that reads the `editNoteId` URL search param.
- When present and notes are loaded, find the matching note and call `openEditDialog(note)`.
- Clean up the URL param after opening.

This ensures clicking the sticky-note icon in the time entries table opens the note editor dialog directly to that specific note.

