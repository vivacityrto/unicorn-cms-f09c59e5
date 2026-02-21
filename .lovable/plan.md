

# Pull All ClickUp Tasks via API with Custom Fields

## Overview

Replace the CSV-based import workflow with a direct ClickUp API integration that fetches all tasks (including custom fields) from the "Membership" list. A new unified table will store the full API response, custom fields will be flattened into dedicated columns, and `tenant_id` will be resolved from the `unicorn_url` custom field -- all server-side.

## Current State

- **clickup_tasks** (889 rows): CSV-imported raw exports with JSONB blobs for comments/assignees
- **clickup_tasksdb** (116 rows): Dashboard CSV exports with custom field values as flat columns, tenant_id resolved from unicorn_url
- **clickup_task_comments** (API-fetched): Individual threaded comments per task
- **v_clickup_tasks**: View joining clickup_tasks LEFT JOIN clickup_tasksdb on task_id
- All 116 tasks are in Space: "Client Success Team", List: "Membership"

## What Changes

### 1. New Table: `clickup_tasks_api`

A single clean table that stores the full ClickUp API task response. Core fields are flattened into proper columns; the raw API JSON is preserved in a `raw_json` JSONB column for anything we haven't explicitly mapped; custom fields are stored both in a `custom_fields` JSONB column and flattened into named columns.

**Core columns** (from API task object):
- `task_id` (text, UNIQUE, NOT NULL) -- the ClickUp ID
- `custom_id` (text) -- custom task ID
- `name` (text)
- `description` (text) -- markdown description
- `text_content` (text) -- plain text version
- `status` (text)
- `priority` (text)
- `parent_task_id` (text)
- `date_created` (bigint) -- unix ms
- `date_updated` (bigint)
- `date_closed` (bigint)
- `date_done` (bigint)
- `due_date` (bigint)
- `start_date` (bigint)
- `time_estimate` (bigint) -- ms
- `time_spent` (bigint) -- ms from time tracking
- `assignees` (jsonb) -- array of user objects
- `watchers` (jsonb)
- `tags` (jsonb)
- `checklists` (jsonb)
- `list_id` (text), `list_name` (text)
- `folder_id` (text), `folder_name` (text)
- `space_id` (text), `space_name` (text)
- `url` (text) -- ClickUp task URL
- `creator_id` (bigint), `creator_username` (text)
- `custom_fields` (jsonb) -- full custom fields array from API

**Flattened custom field columns** (from your existing clickup_tasksdb):
- `unicorn_url` (text)
- `sharepoint_url` (text)
- `mb_level` (text)
- `risk` (text)
- `rto_id` (text)
- `phone` (text)
- `email_address` (text)
- `audit_date` (text)
- `mock_audit` (text)
- `cricos_rereg_date` (text)
- `registration_date` (text)
- `re_reg_due_date` (text)
- `submission_date` (text)
- `working_hours` (text)
- `notes` (text)
- `infusionsoft_url` (text)
- `date_of_last_contact` (text)
- `date_of_last_systemscheck` (text)
- `client_meeting_attendance` (text)
- `time_with_vivacity` (text)
- `registered_spr` (text)
- `on_hold_start_date` (text)
- `on_hold_end_date` (text)

**Derived columns:**
- `tenant_id` (integer, FK tenants) -- resolved from unicorn_url
- `raw_json` (jsonb) -- full API response preserved
- `fetched_at` (timestamptz) -- when last synced

### 2. New Edge Function: `sync-clickup-tasks`

Fetches tasks from the ClickUp API and upserts into `clickup_tasks_api`.

**Step 1 -- Discover the List ID:**
- `GET /api/v2/team` to get workspace (team) ID
- `GET /api/v2/team/{team_id}/space` to find "Client Success Team" space
- `GET /api/v2/space/{space_id}/folder` to find the folder
- `GET /api/v2/folder/{folder_id}/list` to find "Membership" list
- Cache/store the list_id for subsequent calls

**Step 2 -- Fetch all tasks (paginated):**
- `GET /api/v2/list/{list_id}/task?page=0&include_closed=true&subtasks=true`
- Page through (100 per page) until empty
- Rate limited with 650ms delays

**Step 3 -- Map each task:**
- Extract core fields directly from the API response
- Loop through `custom_fields` array, match by `name` (case-insensitive), extract `value` into the corresponding flattened column
- Store the full raw JSON

**Step 4 -- Resolve tenant_id from unicorn_url:**
- Same patterns as current: `/clients/N`, `/stage/N`, `/N`, `/email/N`
- Done in the same function after upsert

**Step 5 -- Also fetch comments:**
- After task sync, call the existing `fetch-clickup-comments` logic per task (or reuse that function)

**Modes supported:**
- `sync_all` -- full sync of all tasks from the list
- `sync_task` -- sync a single task by task_id
- `sync_by_tenant` -- re-sync all tasks for a specific tenant_id

### 3. Custom Field Name Mapping

The edge function will maintain a mapping dictionary from custom field names (as they appear in ClickUp) to database column names:

```text
"Unicorn URL"       -> unicorn_url
"Sharepoint URL"    -> sharepoint_url
"MB Level"          -> mb_level
"Risk"              -> risk
"RTO ID"            -> rto_id
"Phone"             -> phone
"Email Address"     -> email_address
"Audit Date"        -> audit_date
"Mock Audit"        -> mock_audit
"CRICOS ReReg Date" -> cricos_rereg_date
"Registration Date" -> registration_date
"Re Reg Due Date"   -> re_reg_due_date
... (all existing custom fields from clickup_tasksdb)
```

Any custom field not in the mapping is still preserved in the `custom_fields` JSONB column -- nothing is lost.

### 4. Updated View: `v_clickup_tasks`

Replace the current view to read from `clickup_tasks_api` instead of the two legacy tables:

```text
SELECT
  id,
  task_id,
  custom_id as task_custom_id,
  name as task_name,
  description as task_content,
  status,
  priority,
  ...all custom field columns...,
  tenant_id,
  fetched_at
FROM clickup_tasks_api;
```

This keeps the same column aliases so existing UI code continues to work with minimal changes.

### 5. Updated UI

**ClickUpImport page (`/admin/clickup-import`):**
- Add a new "Sync from API" section alongside the existing CSV import
- "Full Sync" button: triggers `sync_all` mode
- Shows progress: tasks fetched, comments synced, tenants resolved
- Keep CSV import as a fallback/legacy option

**ClientStructuredNotesTab:**
- Minimal changes -- the view column names stay the same
- Comments continue to come from `clickup_task_comments` (already working)

### 6. Keep Legacy Tables

The existing `clickup_tasks` and `clickup_tasksdb` tables are kept as-is (you mentioned you duplicated them). No data is deleted. The new `clickup_tasks_api` table becomes the primary source of truth going forward.

## Sequence of Implementation

1. **Database migration**: Create `clickup_tasks_api` table with all columns and indexes
2. **Edge function**: Create `sync-clickup-tasks` with list discovery, task fetching, custom field flattening, and tenant resolution
3. **View update**: Replace `v_clickup_tasks` to read from the new table
4. **UI update**: Add API sync controls to the ClickUp Import page
5. **Backfill**: Run a full sync to populate the new table from the live ClickUp data

## Technical Notes

- The ClickUp API returns 100 tasks per page; with 116 tasks this means 2 API calls for the full list
- Custom fields in the API response look like: `{ "id": "...", "name": "Unicorn URL", "type": "url", "value": "https://..." }`
- Rate limiting: ClickUp allows ~100 requests/minute; the function paces with 650ms delays
- The `CLICKUP_API_KEY` secret is already configured
- Existing `clickup_task_comments` table and `fetch-clickup-comments` function remain unchanged and continue to work
- RLS: Staff-only access policy matching existing clickup tables

