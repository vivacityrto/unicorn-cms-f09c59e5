

## Add Status Field, Duration, and Time Log Prompt to Notes

### Overview

This plan adds three enhancements to the Add Note dialog:
- A **Status** dropdown populated from a new `dd_note_status` lookup table
- A **Duration (mins)** field that appears for Meeting, Phone Call, and Action note types
- A **prompt to log time** after creating notes of those three types

### Database Changes

**1. Create `dd_note_status` lookup table**

A new dropdown/code table with these rows:
- attended
- not_attended
- late
- completed
- scheduled
- abandoned

Columns: `id` (serial PK), `code` (text, unique), `label` (text), `sort_order` (int), `is_active` (boolean, default true)

**2. Add `status` column to `notes` table**

Add a nullable `text` column `status` to the existing `notes` table to store the selected status value.

### Frontend Changes

**3. Widen the Add/Edit Note dialog**

Change `max-w-lg` to `max-w-2xl` to accommodate the extra fields on one row.

**4. Update the Type/Priority row to include Status**

Change the first row from a 2-column grid to a 3-column grid containing:
- Type (existing)
- Priority (existing)
- Status (new -- populated from `dd_note_status`)

**5. Conditionally show Duration field**

When `noteType` is `meeting`, `phone-call`, or `action`:
- Expand the row to 4 columns: Type | Priority | Status | Duration (mins)
- Duration is a numeric `Input` field

**6. Add form state for `status` and `duration`**

New state variables:
- `noteStatus` (string, default empty)
- `duration` (number or empty string)

Both included in `resetForm()` and `handleSave()`.

**7. Persist status and duration on save**

Pass `status` and `duration` to `createNote()` / `updateNote()`. The `notes` table already has a `duration` column (integer). The `status` column will be added by migration.

Update `useNotes.tsx`:
- Add `status` to `Note` interface, `CreateNoteInput`, and `UpdateNoteInput`
- Include `status` in the SELECT query and in create/update operations

**8. Time log prompt after save**

After successfully creating a note with type `meeting`, `phone-call`, or `action` and a duration > 0:
- Show a confirmation dialog: "Would you like to log this as a time entry?"
- If yes, call the existing time tracking RPC to add a manual time entry for the tenant with the specified duration
- If no, just close

**9. Pre-populate edit form**

When editing a note, pre-populate `noteStatus` from `note.status` and `duration` from `note.duration`.

### Files to Modify

| File | Change |
|------|--------|
| `supabase/migrations/` | New migration: create `dd_note_status`, seed rows, add `status` column to `notes` |
| `src/hooks/useNotes.tsx` | Add `status` to Note interface, CreateNoteInput, UpdateNoteInput, and queries |
| `src/components/client/ClientStructuredNotesTab.tsx` | Widen dialog, add Status and Duration fields, add time log prompt dialog |

### Technical Details

- The `dd_note_status` table follows existing code table conventions (`dd_` prefix, `code`/`label`/`sort_order`/`is_active` columns)
- Status values are stored as text codes in the `notes.status` column (not foreign key IDs) to match existing patterns (e.g., `note_type`, `priority`)
- Duration is already an integer column on `notes` -- no migration needed for that field
- The time log prompt uses a separate `AlertDialog` shown after the note is saved, containing a summary and Yes/No buttons
- The responsive grid uses `grid-cols-3` normally and `grid-cols-4` when duration is visible (meeting/phone-call/action types)

