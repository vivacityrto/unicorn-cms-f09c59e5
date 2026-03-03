

## Fix Staff Tasks Count Logic

**Problem:** The "X/Y complete" badge on staff tasks counts incorrectly:
- "Complete" count only includes status 2 (Completed), but should also include status 4 (Core Complete)
- "Total" count includes all tasks, but should exclude status 3 (N/A)

**File to modify:** `src/hooks/useStaffTaskInstances.ts` (lines 284-285)

**Change:**
```typescript
// Before
const completedCount = tasks.filter(t => t.status_id === 2).length;
const totalCount = tasks.length;

// After
const completedCount = tasks.filter(t => t.status_id === 2 || t.status_id === 4).length;
const totalCount = tasks.filter(t => t.status_id !== 3).length;
```

This ensures:
- Status 4 (Core Complete) counts as completed
- Status 3 (N/A) tasks are excluded from the denominator
- The badge accurately reflects actionable progress

Single file, two-line change. No other files affected -- the `completedCount` and `totalCount` values flow into `StageStaffTasks.tsx` which already renders them correctly.

