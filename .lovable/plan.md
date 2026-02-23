

## ClickUp Time Entry Package Instance Allocation

### Overview
Allocate `packageinstance_id` on `clickup_tasks_api` so ClickUp time entries can later be migrated into the production `time_entries` table. This is a two-step process: first auto-match by date overlap (defaulting to the RTO membership), then provide a manual review/override UI. Migration to `time_entries` happens separately, only after allocations are confirmed.

### Current State
- **116 tasks** have a `tenant_id` but no `packageinstance_id`
- **773 tasks** have no `tenant_id` at all (not relevant yet)
- Many tenants have 2+ active RTO memberships (current year + previous year still marked active), plus CRICOS memberships
- Time entries in `clickup_time_entries` have `start_at`/`end_at` timestamps that can be compared against `package_instances.start_date`/`end_date`

### Data Matching Strategy

For each `clickup_tasks_api` row where `tenant_id` is set but `packageinstance_id` is null:

1. Find the earliest `start_at` from its `clickup_time_entries`
2. Find **RTO membership** package instances (package name matching `M-%R%`, i.e. M-GR, M-RR, M-SAR, M-DR -- excluding CRICOS patterns like M-GC, M-RC, M-SAC, M-DC) for that tenant
3. Match where the earliest time entry date falls within the package's `start_date` to `start_date + 365 days` (since most packages have no `end_date`)
4. If exactly one match: set `packageinstance_id`
5. If zero or multiple matches: leave null for manual assignment

---

### Part 1: Database Function for Auto-Matching

**New SQL function: `rpc_match_clickup_to_rto_membership()`**

Logic:
- For each unmatched task (has `tenant_id`, no `packageinstance_id`), find the earliest time entry date
- Join to `package_instances` + `packages` where `packages.name LIKE 'M-%R%'` (RTO memberships only)
- Match where earliest entry date >= `start_date` AND earliest entry date < `start_date + interval '1 year'`
- If exactly one match, update `packageinstance_id`
- Return a summary: tasks matched, tasks unmatched, tasks with no time entries

### Part 2: Package Instance Assignment UI

Add a new **"Assign Package Instances"** card to `src/pages/ClickUpImport.tsx` (below the Time Sync card). This section will:

**Display a table of unmatched tasks** (where `tenant_id` is set, `packageinstance_id` is null):
- Columns: Custom ID, Task Name, Tenant, Time Range (earliest-latest entry dates), Package Instance (dropdown)
- The package dropdown shows all package instances for that tenant with date context: **"M-SAR (18/11/2024 -- 17/11/2025)"** or **"M-SAR (18/11/2024 -- current)"**
- RTO memberships listed first, then other package types
- A save button per row to commit the assignment

**Action buttons:**
- **"Auto-Match RTO Memberships"** -- calls the RPC above, then refreshes the list
- **"Refresh"** -- reloads the unmatched task list

**Summary stats at the top:**
- Tasks with package assigned / total tasks with tenant / tasks with no time entries

### Part 3: Fix Pre-existing Build Errors

The three TS2589 "type instantiation excessively deep" errors in:
- `src/components/eos/LiveMeetingView.tsx` (line 109)
- `src/components/package-builder/StagePreviewDialog.tsx` (line 99)
- `src/hooks/useProcesses.tsx` (line 489)

These are caused by complex Supabase `.select()` joins with FK hints. Fix by casting the query results with `as any` to break the deep type chain.

---

### Technical Details

**New database migration:**
```sql
CREATE OR REPLACE FUNCTION public.rpc_match_clickup_to_rto_membership()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
-- For each clickup_tasks_api row with tenant_id but no packageinstance_id:
-- 1. Find earliest clickup_time_entries.start_at for that task_id
-- 2. Match to package_instances where package name LIKE 'M-%R%'
--    and earliest_date between start_date and start_date + 1 year
-- 3. Update packageinstance_id if exactly one match
-- Returns { matched: N, unmatched: N, no_entries: N }
$$;
```

**Modified files:**

1. **`src/pages/ClickUpImport.tsx`**
   - Add new "Assign Package Instances" Card section
   - New state for unmatched tasks, package instances per tenant
   - Fetch unmatched tasks joined with time entry date ranges
   - Package instance dropdown per row with date labels (dd/MM/yyyy format)
   - Auto-match button calling the RPC
   - Save per-row to update `clickup_tasks_api.packageinstance_id`

2. **`src/components/eos/LiveMeetingView.tsx`** -- add type cast to fix TS2589
3. **`src/components/package-builder/StagePreviewDialog.tsx`** -- add type cast to fix TS2589
4. **`src/hooks/useProcesses.tsx`** -- add type cast to fix TS2589

**No changes to `time_entries` or Add/Edit Time dialogs in this step** -- that comes after allocations are confirmed.

