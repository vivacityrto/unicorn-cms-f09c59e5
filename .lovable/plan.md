

## Issue 1: Code Tables Not Showing Up

**Root Cause**: The `list_code_tables` RPC checks the `users.role` column in the database, but your user record has `role = 'Client Child'` instead of `'Super Admin'`. Your JWT metadata says "Super Admin" but the database row disagrees -- likely the role was overwritten by a recent migration or user management action.

**Fix**: Run a SQL update to correct your role in the `users` table, and also make the RPC more resilient by checking JWT metadata as a fallback:

1. **Database fix** -- Update your user role:
   ```text
   UPDATE public.users SET role = 'Super Admin' WHERE user_uuid = '551f13b0-...';
   ```
2. **No code changes needed** -- Once the database role is corrected, the existing `list_code_tables` RPC will work again.

---

## Issue 2: Import ClickUp Time Tracking into Unicorn 2.0

**What exists today**:
- The `sync-clickup-tasks` edge function already syncs tasks from ClickUp and stores `time_spent` / `time_estimate` (milliseconds) on `clickup_tasks_api`, but these come from the task object itself and are often empty.
- ClickUp has a **dedicated Time Tracking API** (`GET /task/{task_id}/time`) that returns individual time entries with start/end times, durations, and who logged them.

**Plan**: Create a new edge function `sync-clickup-time` that fetches detailed time entries from ClickUp and either stores them in a new `clickup_time_entries` table or maps them directly into the existing `time_entries` table.

### Database Changes

Create a staging table `clickup_time_entries` to store raw ClickUp time data before mapping:

| Column | Type | Purpose |
|--------|------|---------|
| id | bigserial | PK |
| clickup_interval_id | text (unique) | ClickUp's time entry ID |
| task_id | text | ClickUp task ID |
| tenant_id | integer | Resolved from task |
| user_name | text | Who logged it in ClickUp |
| user_email | text | For matching to Unicorn users |
| duration_ms | bigint | Duration in milliseconds |
| duration_minutes | integer | Computed (ms / 60000) |
| start_at | timestamptz | When work started |
| end_at | timestamptz | When work ended |
| description | text | ClickUp time entry notes |
| billable | boolean | ClickUp billable flag |
| imported_to_time_entries | boolean | Whether mapped to Unicorn |
| imported_at | timestamptz | When fetched |

RLS: Read access for Vivacity staff, write via service role only.

### Edge Function: `sync-clickup-time`

- **Mode `sync_all`**: For each task in `clickup_tasks_api`, call `GET /task/{task_id}/time` with rate limiting (650ms), flatten entries, and upsert into `clickup_time_entries`.
- **Mode `sync_by_tenant`**: Same but scoped to tasks matching a given `tenant_id`.
- **Batch processing**: Process tasks in batches of 50 with resumable pagination.
- **Tenant resolution**: Copy `tenant_id` from the parent `clickup_tasks_api` row.

### UI Integration

Add a "Sync Time Entries" button/section to the existing ClickUp Sync admin page (`/admin/clickup-import`), showing:
- Count of ClickUp time entries imported
- A button to trigger the sync
- Status/progress feedback

### Technical Details

- **Files to create**:
  - `supabase/functions/sync-clickup-time/index.ts` -- new edge function
  - Database migration for `clickup_time_entries` table

- **Files to modify**:
  - The ClickUp import/sync admin page to add the time sync UI section

- **ClickUp API endpoint**: `GET /api/v2/task/{task_id}/time` returns an array of time intervals with `id`, `start`, `end`, `time` (duration ms), `user`, `billable`, and `description`.

- **Rate limiting**: Same 650ms delay pattern as existing `sync-clickup-tasks`.

- **Future phase**: A separate mapping step could match ClickUp users to Unicorn users and create proper `time_entries` records with the `source = 'clickup'` tag. This would be a follow-up feature.

