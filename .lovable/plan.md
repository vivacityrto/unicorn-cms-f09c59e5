

## Issues Found in `publish_stage_version`

Two bugs need fixing via a corrective migration:

### Bug 1 — Function Overload Conflict
The previous migration defined `publish_stage_version(p_stage_id bigint, ...)`. The new migration created a second overload with `integer`. Both now exist in Postgres, which will cause "multiple candidate functions" errors when called via Supabase RPC. The old `bigint` overload must be dropped first.

### Bug 2 — Wrong Type for `client_task_instances.status`
The `client_task_instances.status` column is an **integer** (not text). The function inserts `'Not Started'` (a string), which will fail. It should insert `0` (matching the default status value used elsewhere in the codebase).

### Fix — Single Migration

```sql
-- Drop the stale bigint overload
DROP FUNCTION IF EXISTS public.publish_stage_version(bigint, text);

-- Recreate with integer parameter (same body as current, 
-- but fix client_task_instances insert: 'Not Started' → 0)
CREATE OR REPLACE FUNCTION public.publish_stage_version(
  p_stage_id integer, p_notes text DEFAULT NULL
) RETURNS uuid ...
```

The only change inside the function body is line 136:
- **Before**: `SELECT ct.id, v_si.stage_instance_id, 'Not Started'`
- **After**: `SELECT ct.id, v_si.stage_instance_id, 0`

### Files Changed
- **1 database migration** — drops old overload, recreates fixed function

