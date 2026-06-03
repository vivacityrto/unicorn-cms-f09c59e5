## Plan: Stabilise `refresh` callback and prevent effect loop in time tracking

### Overview
The `refresh` callback returned by `useTimeTracking` is currently an inline arrow function, so it gets a new reference on every render. Including it in a `useEffect` dependency array in `TimeLogDrawer` creates a risk of an infinite re-render loop if any upstream state changes.

### Changes

#### 1. `src/hooks/useTimeTracking.tsx`
Wrap the `refresh` function in `useCallback` so its reference is stable across renders.

- Before: `refresh` is returned as an inline arrow expression.
- After: `refresh` is declared as `useCallback(..., [fetchActiveTimer, fetchEntries, fetchSummary])` and returned by name.

#### 2. `src/components/client/TimeLogDrawer.tsx`
Remove `refresh` from the `useEffect` dependency array that fires when the drawer opens. The effect still calls `refresh()` on open; omitting it from the array prevents any future loop if the reference ever becomes unstable.

- Add `// eslint-disable-next-line react-hooks/exhaustive-deps` above the array.

### Verification
- Open the Time Log drawer after adding a time entry via `NoteFormDialog` or `AddTimeDialog`.
- New entry should appear immediately without a page reload.
- No console warnings or infinite re-render loops should occur.

No other files or logic will be touched.