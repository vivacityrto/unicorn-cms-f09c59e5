## Goal

Wire up the `parent_defined` work type so selecting it on `AddTimeDialog` consumes the entire package’s consult budget in one entry, auto-prefilling date (package start date), duration (full package consult minutes), and notes referencing the parent organisation. After the entry is created, the package is locked against further time entries via a DB trigger.

## Scope

- `AddTimeDialog.tsx` — parent branch, auto-fill logic, parent lookup.
- `EditTimeDialog.tsx` — readonly view for parent_defined entries.
- One DB migration: trigger on `time_entries`.
- One data fix: `dd_work_types` typo.

No changes to hooks, stats, or package detail pages.

## Corrected notes copy

Auto-prefilled notes:
```
Time entry is locked for Child packages. All time is administered/allocated/entered against parent: {rto_id} - {rto_name}
```

## Lock mechanism

New `BEFORE INSERT OR UPDATE` trigger on `time_entries`:
- If `NEW.package_instance_id IS NOT NULL` AND a different row already exists for that `package_instance_id` with `work_type='parent_defined'`, raise:
  `EXCEPTION 'Package is allocated to parent organisation; no further time entries allowed.'`

## Files

- `src/components/client/AddTimeDialog.tsx`
- `src/components/client/EditTimeDialog.tsx`
- Migration: `time_entries` trigger
- Data update: `dd_work_types` typo fix
