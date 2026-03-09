

## Show Comments and Hours Fields When Attaching to Parent

### What Changes

When a parent package is selected in the "Attach to package" dropdown, two new fields appear:

1. **Hours** — pre-filled with the selected package's `total_hours`, editable
2. **Comments** — a text input for noting the reason/context (e.g. "Extra TAS days for Q2")

Both values are saved to the new child `package_instances` record on creation.

### Technical Details

**`StartPackageDialog.tsx`**:
- Add `comments` and `hoursUsed` state variables
- When `attachToInstanceId` changes and a parent is selected, auto-fill `hoursUsed` from the selected package's `total_hours`
- Render an `Input` (type number, for hours) and a `Textarea` (for comments) below the "Attach to" dropdown, only when a parent is selected
- After creating the instance, update it with the `comments` value and set `hours_used` to the entered hours value

**No migration needed** — the `comments` column already exists on `package_instances`. The `hours_used` column also already exists.

### Files Modified

- `src/components/client/StartPackageDialog.tsx`

