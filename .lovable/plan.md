
# Fix: Audit Log Type Mismatch in create_todos_from_issue

## Problem

When clicking "Mark as Solved", the system throws:

**"Error creating to-dos: column 'entity_id' is of type uuid but expression is of type text"**

## Root Cause

In the `create_todos_from_issue` RPC function (line 66 of the latest migration), the INSERT into `audit_eos_events` incorrectly casts the uuid to text:

```sql
entity_id,
...
p_issue_id::text,  -- WRONG: casting uuid to text
```

The `audit_eos_events.entity_id` column is of type **uuid**, not text.

## Solution

Update the RPC function to pass the uuid directly without casting:

```sql
entity_id,
...
p_issue_id,  -- CORRECT: already a uuid
```

---

## Technical Details

### File to Create
New SQL migration to fix the function

### Change Summary

| Line | Current | Fixed |
|------|---------|-------|
| 66 | `p_issue_id::text` | `p_issue_id` |

### Complete Fixed Function

The INSERT into `audit_eos_events` will become:

```sql
INSERT INTO audit_eos_events (
  tenant_id,
  entity,
  entity_id,
  action,
  user_id,
  details
) VALUES (
  v_tenant_id,
  'todo',
  p_issue_id,  -- No ::text cast needed
  'bulk_create',
  v_user_id,
  jsonb_build_object('count', array_length(v_created_ids, 1), 'from_issue', p_issue_id)
);
```

---

## Expected Outcome

1. User adds to-dos in the Solve tab
2. User clicks "Mark as Solved"
3. Status transitions complete: Open to Discussing to Solved
4. To-dos are created with status "Open"
5. Audit log entry is created successfully
6. Dialog closes without errors

---

## Files to Modify

| File | Action |
|------|--------|
| New SQL migration | Replace the RPC function with correct typing |

---

## Verification Checklist

After implementation:
1. Open an issue in "Open" status
2. Go to Solve tab, enter solution
3. Add at least one to-do
4. Click "Mark as Solved"
5. Confirm no toast errors appear
6. Verify issue is now "Solved"
7. Verify to-dos appear in the meeting's To-Do list
