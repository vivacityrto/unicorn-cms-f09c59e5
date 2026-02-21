

# Fix ClickUp CSV Importer: Two Tables, Tenant Resolution

## Problem

The current importer sends everything to `clickup_tasksdb`, but the two CSV files serve different purposes:

1. **Raw ClickUp Export** (headers: `task_id, task_name, comments, list_name, assignees...`) should go into **`clickup_tasks`** -- this table has JSONB columns for comments/assignees/checklists and stores the raw export data.

2. **Dashboard Export** (headers match DB columns like `unicorn_url, tenant_id, mb_level, cricos_rereg_date...`) should go into **`clickup_tasksdb`** -- this table stores enriched dashboard data with tenant association.

Additionally, `tenant_id` in `clickup_tasksdb` needs to be **derived from `unicorn_url`** using three URL patterns:
- `/clients/6278` -- the number IS the tenant_id directly
- `/stage/21655` -- look up `v_tenant_stage_instances` to get tenant_id
- `/14972` (bare number, also `/email/XXXXX`) -- look up `package_instances` to get tenant_id

## Solution

### Step 1: Restructure the Import Page with Two Modes

Update `src/pages/ClickUpImport.tsx` to offer a choice between:
- **"ClickUp Export"** -- maps to `clickup_tasks` table
- **"Dashboard Export"** -- maps to `clickup_tasksdb` table

Each mode uses its own column mapping dictionary.

### Step 2: Fix Column Mapping for `clickup_tasks`

The `clickup_tasks` table columns closely match the raw CSV headers, but some fields need special handling:
- `comments`, `assignees`, `checklists`, `assigned_comments`, `attachments` are JSONB -- parse as JSON or wrap as arrays
- `tags` is also JSONB
- Keep `parent_id` (this table has it, unlike `clickup_tasksdb`)

### Step 3: Dashboard Export Mapping for `clickup_tasksdb`

For the dashboard CSV, headers likely match DB columns directly (since it's exported from a dashboard view). A light mapping pass will normalise any differences.

### Step 4: Add Tenant Resolution Logic

After importing dashboard rows into `clickup_tasksdb`, resolve `tenant_id` from `unicorn_url` for rows where `tenant_id` is NULL:

1. Parse the URL to extract the path pattern and numeric ID
2. `/clients/N` -- set `tenant_id = N`
3. `/stage/N` -- query `v_tenant_stage_instances` where `stage_instance_id = N` to get `tenant_id`
4. `/N` or `/email/N` or other patterns -- query `package_instances` where `id = N` to get `tenant_id`

This resolution will happen in the **edge function** after the upsert, so it runs server-side with service role access.

### Step 5: Add Unique Constraint on `clickup_tasks.task_id`

The `clickup_tasks` table currently has no unique constraint on `task_id`, which will cause the same upsert error. Add one via migration.

### Step 6: Update Edge Function

Modify `supabase/functions/import-clickup-csv/index.ts` to:
- Accept a `target_table` parameter (`clickup_tasks` or `clickup_tasksdb`)
- Upsert to the specified table
- When target is `clickup_tasksdb`, run tenant resolution after upsert

## Technical Details

### Files to Modify

1. **`src/pages/ClickUpImport.tsx`** -- Add table selector toggle, separate mapping dictionaries for each table, pass `target_table` to edge function
2. **`supabase/functions/import-clickup-csv/index.ts`** -- Accept `target_table` param, add tenant resolution SQL for `clickup_tasksdb`
3. **Database migration** -- Add unique constraint on `clickup_tasks(task_id)`

### Tenant Resolution SQL (in edge function)

```text
For /clients/N:
  UPDATE clickup_tasksdb SET tenant_id = N WHERE id = row.id

For /stage/N:
  SELECT tenant_id FROM v_tenant_stage_instances WHERE stage_instance_id = N

For /N (package):
  SELECT tenant_id FROM package_instances WHERE id = N
```

### Column Mapping: ClickUp Export to `clickup_tasks`

```text
CSV Header           -->  DB Column          Notes
task_id              -->  task_id
task_custom_id       -->  task_custom_id
task_name            -->  task_name
task_content         -->  task_content
status               -->  status
date_created         -->  date_created
date_created_text    -->  date_created_text
due_date             -->  due_date
due_date_text        -->  due_date_text
start_date           -->  start_date
start_date_text      -->  start_date_text
parent_id            -->  parent_id
assignees            -->  assignees           (parse as JSONB)
tags                 -->  tags                (parse as JSONB)
priority             -->  priority
list_name            -->  list_name
folder_name_path     -->  folder_name_path
space_name           -->  space_name
time_estimated       -->  time_estimated
time_estimated_text  -->  time_estimated_text
checklists           -->  checklists          (parse as JSONB)
comments             -->  comments            (parse as JSONB)
assigned_comments    -->  assigned_comments   (parse as JSONB)
time_spent           -->  time_spent
time_spent_text      -->  time_spent_text
rolled_up_time       -->  rolled_up_time
rolled_up_time_text  -->  rolled_up_time_text
```

### Column Mapping: Dashboard Export to `clickup_tasksdb`

Headers match DB columns directly -- pass through with minimal transformation. The `tenant_id` column will be auto-resolved from `unicorn_url` after import.
