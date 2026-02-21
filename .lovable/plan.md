
# ClickUp CSV Importer

## Problem
When importing ClickUp CSV exports directly via Supabase, column names don't match the `clickup_tasksdb` table schema. This causes large fields like `comments` to be silently dropped (stored as `null`).

## Solution
Build a dedicated ClickUp CSV import page in the SuperAdmin area that:
1. Parses the CSV client-side (using PapaParse)
2. Auto-maps ClickUp CSV headers to `clickup_tasksdb` columns
3. Shows a preview of mapped data before importing
4. Inserts rows via an edge function (service role, bypasses RLS)

## Column Mapping (Hardcoded)

The importer will use a fixed mapping dictionary:

```text
CSV Header              -->  DB Column
-----------------------------------------------
task_id                 -->  task_id
task_custom_id          -->  task_custom_id
task_name               -->  task_name
task_content            -->  task_content
status                  -->  status
date_created            -->  date_created
date_created_text       -->  (stored in date_created if date_created is empty)
due_date                -->  due_date
due_date_text           -->  (fallback for due_date)
start_date              -->  start_date
start_date_text         -->  (fallback for start_date)
assignees               -->  assignee (parsed as JSON array)
tags                    -->  tags
priority                -->  priority
list_name               -->  list
folder_name_path        -->  folder
space_name              -->  space
time_estimated          -->  time_estimate
time_estimated_text     -->  (fallback for time_estimate)
checklists              -->  (ignored - no column)
comments                -->  latest_comment
assigned_comments       -->  assigned_comment_count (count only)
time_spent              -->  time_logged
time_spent_text         -->  (fallback for time_logged)
rolled_up_time          -->  time_logged_rolled_up
rolled_up_time_text     -->  (fallback)
parent_id               -->  (ignored - no column)
```

## Implementation Steps

### 1. Install PapaParse
Add `papaparse` and `@types/papaparse` for robust CSV parsing that handles quoted fields with commas, newlines, etc.

### 2. Create Import Page Component
**File:** `src/pages/ClickUpImport.tsx`

- File upload dropzone (accepts `.csv`)
- Parse CSV using PapaParse with `header: true`
- Display summary: row count, mapped vs unmapped columns
- Preview table showing first 5 rows of mapped data
- "Import" button with progress indicator
- Option to choose behavior for duplicates (skip or overwrite based on `task_id`)

### 3. Create Edge Function
**File:** `supabase/functions/import-clickup-csv/index.ts`

- Accepts JSON array of pre-mapped rows
- Upserts into `clickup_tasksdb` (using `task_id` as conflict key)
- Sets `imported_at` to current timestamp
- Processes in batches of 50 rows
- Returns success/error counts

### 4. Add Route
Add the import page to the router, accessible from the SuperAdmin Tasks Management area or as a standalone route like `/admin/clickup-import`.

### 5. Add Navigation Link
Add an "Import ClickUp CSV" button on the Tasks Management page for easy access.

## Technical Details

- **PapaParse** handles the core issue: it correctly parses quoted CSV fields containing commas, newlines, and special characters that break Supabase's built-in importer
- **Client-side mapping** transforms CSV headers to DB column names before sending to the edge function
- **Upsert on task_id** prevents duplicates when re-importing updated exports
- **Batch processing** (50 rows per request) avoids payload size limits
- **Audit trail**: each import sets `imported_at` so you can track when data was loaded

## Files to Create/Modify
1. **Create** `src/pages/ClickUpImport.tsx` - Import UI with file upload, preview, and mapping
2. **Create** `supabase/functions/import-clickup-csv/index.ts` - Upsert edge function
3. **Modify** `supabase/config.toml` - Register new edge function
4. **Modify** `src/App.tsx` (or router file) - Add route
5. **Modify** `src/pages/TasksManagement.tsx` - Add navigation button
