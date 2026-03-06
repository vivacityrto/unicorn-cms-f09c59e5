

## Link Time Entries to Notes + Reposition Notify Client Checkbox

No migration needed — `timeentry_id` column already exists on `notes`.

### Changes

**1. `src/components/client/AddTimeDialog.tsx`**

- Update insert to use `.select('id').single()` to get the new time entry UUID
- After save, show AlertDialog: "Create a note from this time entry?"
  - **Yes**: navigate to `/tenant/{tenantId}/notes?initNote=true&noteTitle=TIME: {workTypeLabel} ({H:MM})&timeEntryId={uuid}&noteDetails={notes text}&packageId={selectedInstanceId}`
  - **No**: close normally
- **Move Notify Client checkbox** into DialogFooter left side: `[NotifyClient] ··· [Cancel] [Add Time]`

**2. `src/pages/TenantNotes.tsx`**

- Read `timeEntryId` and `noteDetails` from URL params in the `initNote` handler
- Pre-fill noteText with noteDetails, store timeEntryId in state
- Pass `timeentry_id` into `createNote` call
- Clean up URL params after reading

**3. `src/hooks/useNotes.tsx`**

- Add `timeentry_id?: string` to `CreateNoteInput`
- Include `timeentry_id` in the insert payload

### Column name

The notes table column is **`timeentry_id`** (no underscore between "time" and "entry"). All references use this exact name.

### Title format

`TIME: {Work Type Label} ({H}:{MM})` — e.g. `TIME: Document Review (1:30)`

