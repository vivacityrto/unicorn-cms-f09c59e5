

## Root Cause: Confirmed -- `is_superadmin()` Case Mismatch

### Evidence from Database

**The function** (`is_superadmin()`):
```sql
SELECT EXISTS (
  SELECT 1 FROM public.users
  WHERE user_uuid = auth.uid()
    AND global_role = 'superadmin'   -- lowercase
)
```

**The actual data** (for the logged-in user `551f13b0-...`):
```
global_role = 'SuperAdmin'   -- PascalCase
unicorn_role = 'Super Admin'
```

**The RLS policies on `staff_tasks`**:
- UPDATE: `qual = is_superadmin()`, `with_check = is_superadmin()`
- INSERT: `with_check = is_superadmin()`
- DELETE: `qual = is_superadmin()`

Since `'superadmin' != 'SuperAdmin'`, **every UPDATE/INSERT/DELETE is silently blocked by RLS**. Supabase returns HTTP 204 with 0 rows affected -- no error is thrown, so the frontend shows "Task Updated" but nothing changes.

### Why Previous Code Fixes Failed

The frontend code is correct. `updateTeamTask()` properly passes `is_key_event`, `is_core`, `name`, `description`, and `due_date_offset`. The Supabase `.update()` call is well-formed. The problem is entirely at the database layer -- RLS rejects the operation silently.

### Fix: Single SQL Migration

Update the `is_superadmin()` function to use case-insensitive comparison:

```sql
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE user_uuid = auth.uid()
      AND lower(global_role) = 'superadmin'
  )
$$;
```

### Impact

This single change fixes all saves across the admin stage detail page:
- Team task edits (name, description, key event flag, core flag, due date offset)
- Key event toggle from the task list
- Client task edits
- Email and document edits
- Any other table using `is_superadmin()` in RLS policies

### No Frontend Code Changes Needed

The existing code in `useStageTemplateContent.tsx` and `AdminStageDetail.tsx` is correct and does not need modification.

