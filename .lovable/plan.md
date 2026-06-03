## Plan: Replace single duration input with hours + minutes split in NoteFormDialog.tsx

### What
Replace the single "Duration (minutes)" input in the Log Time section of `NoteFormDialog.tsx` (lines 790–793) with an hours + minutes split input, using the already-existing `timeHours`/`timeMinutes` state and the same pattern as `AddTimeDialog`.

### How
1. Replace lines 790–793 with the exact hours/minutes JSX block you specified.
2. No other changes — all dependent state (`timeHours`, `timeMinutes`, `durationError`, `totalTimeMinutes`) is already present.

### Scope
- **File:** `src/components/notes/NoteFormDialog.tsx` only
- **Lines affected:** 790–793 (the duration input block within the Log Time section)
- **No changes to:** state declarations, validation logic, `resetForm`, `handleSave`, or any other section of the file