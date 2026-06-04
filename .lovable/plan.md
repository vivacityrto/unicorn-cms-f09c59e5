## Goal
Loosen the minutes input in `AddTimeDialog.tsx` and `NoteFormDialog.tsx` from 15-minute increments (step=15, max=45) to free 0–59 entry (step=1, max=59) with plain clamping, matching `EditTimeDialog.tsx`.

## Files
1. `src/components/client/AddTimeDialog.tsx` — lines 630-642
2. `src/components/notes/NoteFormDialog.tsx` — lines 802-814

## Changes (same in both files)
- `max="45"` → `max="59"`
- `step="15"` → `step="1"`
- Replace rounding `onChange`:
  ```
  const val = Math.round(parseInt(e.target.value) / 15) * 15;
  setXxx(String(Math.max(0, Math.min(45, isNaN(val) ? 0 : val))));
  ```
  with plain clamping:
  ```
  const val = parseInt(e.target.value);
  setXxx(String(Math.max(0, Math.min(59, isNaN(val) ? 0 : val))));
  ```

## Out of scope
- No changes to hours input, work type selects, billable toggle, submit logic, or any other field.
- `EditTimeDialog.tsx` is untouched (it already has the target pattern).