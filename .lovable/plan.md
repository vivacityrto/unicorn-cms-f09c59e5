## Goal
Ensure time entries and summary are re-fetched from the database every time the TimeLogDrawer opens, so newly added entries are visible without a page reload.

## Change
In `src/components/client/TimeLogDrawer.tsx`, add a call to `refresh()` inside the existing `useEffect` that fires when the drawer opens.

### Before
```tsx
useEffect(() => {
  if (open) fetchPackageInstances();
}, [open, fetchPackageInstances]);
```

### After
```tsx
useEffect(() => {
  if (open) {
    fetchPackageInstances();
    refresh();
  }
}, [open, fetchPackageInstances, refresh]);
```

## Why this is safe
- `refresh` is already destructured from `useTimeTracking(clientId)` on line 80.
- `fetchPackageInstances` is wrapped in `useCallback`, so the dependency array remains stable.
- `refresh` from `useTimeTracking` is a stable callback reference (or wrapped appropriately), making the `useEffect` dependency change safe.
- This only affects the drawer's open behavior and does not alter rendering, deletion, editing, or filtering logic.

## Verification
1. Open the drawer after adding time via `AddTimeDialog` or `NoteFormDialog`.
2. Confirm the new entry appears immediately without a full page reload.
3. Confirm existing entries still load correctly.
