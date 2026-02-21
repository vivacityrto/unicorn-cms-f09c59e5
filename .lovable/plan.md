
# Update ClickUp Sync Page

## Changes

### 1. Remove legacy table references
Remove the two legacy table count cards (`clickup_tasks`, `clickup_tasksdb`) from the stats grid and the `TableCount` interface. The grid will show only 2 cards: **Tasks (API)** and **Comments**.

### 2. Add comments count
The comments count card is already present in the code but was reported as not showing. On review, it IS in the grid -- the issue is that it was styled with `opacity-70` (the "non-primary" style). It will be made primary like the tasks card so it stands out equally.

### 3. Simplify the counts fetch
Remove the two `supabase.from("clickup_tasks")` and `supabase.from("clickup_tasksdb")` queries from `fetchCounts`. Only fetch counts for `clickup_tasks_api` and `clickup_task_comments`.

## Technical Details

**File: `src/pages/ClickUpImport.tsx`**

- `TableCount` interface: remove `clickup_tasks` and `clickup_tasksdb` fields, keep only `clickup_tasks_api` and `clickup_task_comments`
- `fetchCounts`: remove the two legacy `Promise.all` entries (r3, r4)
- Stats grid: reduce to 2 cards, both styled as primary:
  - "Tasks (API)" showing `clickup_tasks_api` count
  - "Comments" showing `clickup_task_comments` count
- No other changes needed -- sync, comments fetch, and task list remain as-is
