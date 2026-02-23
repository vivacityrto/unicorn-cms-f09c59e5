
# Fix: ClickUp Comments Not Showing for Tenant

## Problem

The "Structured Notes" tab queries `clickup_task_comments` filtered by `tenant_id = 7536`, but the 15 comments for task `86d17h5q5` all have `tenant_id = null`. This means they are invisible on the tenant page.

This happened because the task was assigned to a tenant before the comment propagation logic was added. The recent fix only applies going forward when a tenant is manually assigned via the ClickUp Sync page.

## Root Cause

- `ClientStructuredNotesTab.tsx` line 319: `loadApiComments` queries `.eq('tenant_id', tenantId)` -- comments with null tenant_id are excluded
- The 15 existing comments were never backfilled with the correct tenant_id

## Plan

### Step 1: Backfill existing orphaned comments (database fix)

Run a one-time UPDATE to propagate `tenant_id` from `clickup_tasks_api` to `clickup_task_comments` wherever comments have a null `tenant_id` but their parent task already has one assigned.

```sql
UPDATE clickup_task_comments c
SET tenant_id = t.tenant_id
FROM clickup_tasks_api t
WHERE c.task_id = t.task_id
  AND t.tenant_id IS NOT NULL
  AND c.tenant_id IS NULL;
```

This is a safe, idempotent operation that only fills in missing tenant_ids.

### Step 2: Update the comment fetch after "Fetch from API" (code fix)

In `ClientStructuredNotesTab.tsx`, after the edge function fetches and stores comments for a task, the local refresh query (line 343-347) does not filter by `tenant_id`. However, the newly fetched comments from the edge function may also have null `tenant_id` if the edge function does not know the tenant context.

Update `handleFetchTaskComments` to also update the `tenant_id` on the freshly fetched comments in the database before reloading them. This ensures that when comments are fetched from ClickUp API for a task that already has a tenant assigned, the comments immediately get the correct `tenant_id`.

### Step 3: Defensive query fallback (code fix)

Update `loadApiComments` to also include comments where `tenant_id` is null but the `task_id` matches a task linked to this tenant. This provides a safety net so comments are never silently hidden.

### Technical Details

**Files to modify:**
- `src/components/client/ClientStructuredNotesTab.tsx` -- Update `handleFetchTaskComments` to set `tenant_id` on comments after fetch; update `loadApiComments` to handle the edge case
- New database migration -- Backfill orphaned comments with correct `tenant_id`

**Impact:** All 15 comments for Triquetra Visions (and any other tenants with the same orphan issue) will become visible immediately after the backfill. Future comment fetches will correctly inherit the tenant_id.
