
# IDS Process Audit and Fix Plan

## Audit Findings

### Finding 1: Missing Column in eos_todos Table (CRITICAL - Current Error)
The `create_todos_from_issue` RPC function tries to INSERT into a column called `issue_id` that does not exist in the `eos_todos` table.

**Current eos_todos columns:**
- id, tenant_id, client_id, title, description, assigned_to, status, due_date, completed_date, meeting_id, created_at, updated_at, created_by, owner_id, completed_at

**Missing:** `issue_id`

### Finding 2: Wrong Status Value
The migration uses `'pending'` for the todo status, but the `eos_todo_status` enum only accepts:
- `Open`
- `Complete`
- `Cancelled`

### Finding 3: Status Transitions Are Working Correctly
The frontend deterministic transition logic is correctly implemented:
- From "Open" to "Discussing" (allowed)
- From "Discussing" to "Solved" (allowed)
- The `fromStatus` parameter bypasses stale prop issues

---

## Implementation Plan

### Step 1: Fix create_todos_from_issue RPC Function

**File to create:** New SQL migration

**Changes:**
1. Remove the `issue_id` column from the INSERT statement (it doesn't exist)
2. Change status from `'pending'` to `'Open'` (correct enum value)
3. Keep the working parts: tenant_id, meeting_id, title, owner_id, assigned_to, due_date, created_by

**Updated INSERT statement:**
```sql
INSERT INTO eos_todos (
  tenant_id,
  meeting_id,
  title,
  owner_id,
  assigned_to,
  due_date,
  status,
  created_by
) VALUES (
  v_tenant_id,
  v_meeting_id,
  v_todo->>'title',
  (v_todo->>'owner_id')::uuid,
  (v_todo->>'owner_id')::uuid,
  (v_todo->>'due_date')::date,
  'Open',
  v_user_id
)
```

### Step 2: Update Audit Log Entity Reference (Optional Enhancement)
Since we cannot directly link todos to issues via a column, the audit log should capture the relationship in the `details` JSONB field. The current implementation already does this:
```sql
details: jsonb_build_object('count', ..., 'from_issue', p_issue_id)
```

This is sufficient for traceability without schema changes.

---

## Files to Modify

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/[new]` | Create | Replace the buggy RPC function |

---

## Expected Outcome After Fix

1. User opens IDS dialog for an "Open" issue
2. User navigates to "Solve" tab
3. User enters solution text
4. User adds to-dos with title, owner, and due date
5. User clicks "Mark as Solved"
6. System:
   - Transitions Open to Discussing (silent, via fromStatus: 'Open')
   - Transitions Discussing to Solved (via fromStatus: 'Discussing')
   - Creates to-dos with status "Open" (correct enum)
   - Closes dialog
7. No errors occur

---

## Testing Checklist

After implementation:
1. Create a new issue during a live meeting
2. Navigate directly to Solve tab while status is "Open"
3. Enter a solution
4. Add 1-2 to-dos with different owners and due dates
5. Click "Mark as Solved"
6. Verify:
   - No toast errors
   - Issue status is now "Solved"
   - To-dos appear in the meeting's To-Do list
   - To-dos have status "Open" (not "pending")
