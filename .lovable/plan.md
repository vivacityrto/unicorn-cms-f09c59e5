
## Fix Rock Update Not Saving

### Problem
When editing a Rock and changing the Team Member Responsible, the change does not persist. The DB shows `updated_at` changing but `owner_id` remaining the same, suggesting the update either errors silently or the payload is incorrect.

### Root Causes Identified

1. **No error handling in handleSubmit**: The `handleSubmit` function in `RockFormDialog.tsx` calls `updateRock.mutateAsync()` without try/catch. If the mutation fails, the error is thrown but not caught -- the dialog stays open and the user gets no clear feedback about what went wrong.

2. **RockProgressControl uses wrong status values**: This separate component sends lowercase status values (`on_track`, `off_track`, `complete`, `abandoned`) directly to the DB, but the DB enum expects PascalCase (`On_Track`, `Off_Track`, `Complete`). The value `abandoned` doesn't even exist in the enum. If this component was ever used to update status, it could corrupt the row state.

### Plan

**File: `src/components/eos/RockFormDialog.tsx`**
- Wrap `handleSubmit` in try/catch to properly handle errors and show feedback
- Add explicit error toast on failure so the user knows the save failed
- Only close the dialog and reset the form on successful save

**File: `src/components/eos/RockProgressControl.tsx`**
- Replace hardcoded lowercase status values with proper `DB_ROCK_STATUS` constants and `getStatusOptions()` helper
- Remove the non-existent `abandoned` status option
- Use `uiToDbStatus()` conversion where needed

### Technical Details

```text
handleSubmit changes:
  Before:  await updateRock.mutateAsync({ ... });
           onOpenChange(false);
           resetForm();
  
  After:   try {
             await updateRock.mutateAsync({ ... });
             onOpenChange(false);
             resetForm();
           } catch (error) {
             // onError callback shows toast, dialog stays open
             console.error('Rock save failed:', error);
           }
```

```text
RockProgressControl status fix:
  Before:  <SelectItem value="on_track">On Track</SelectItem>
           <SelectItem value="abandoned">Abandoned</SelectItem>
  
  After:   Uses getStatusOptions() from rockStatusUtils
           to generate correct PascalCase enum values
```
