
# Fix: To-Do Creation Type Mismatch

## Problem

When clicking "Mark as Solved" after adding to-dos in the IDS dialog, the system throws an error:

**"Error creating to-dos: column 'owner_id' is of type uuid but expression is of type text"**

This occurs because the `create_todos_from_issue` RPC function extracts the `owner_id` from JSONB using the `->>` operator, which returns a text value. However, the `eos_todos` table expects UUID types for both `owner_id` and `assigned_to` columns.

## Root Cause

In the SQL function:
```sql
owner_id,
assigned_to,
...
v_todo->>'owner_id',   -- Returns TEXT
v_todo->>'owner_id',   -- Returns TEXT
```

The `eos_todos` table schema requires:
- `owner_id`: UUID
- `assigned_to`: UUID

## Solution

Update the `create_todos_from_issue` RPC function to explicitly cast the extracted text values to UUID.

---

## Technical Details

### File to Create: New Migration

A new SQL migration will update the function with explicit type casting:

```sql
owner_id,
assigned_to,
...
(v_todo->>'owner_id')::uuid,
(v_todo->>'owner_id')::uuid,
```

### Complete Function Update

The INSERT statement within the function will be modified to cast text values to their correct types:

| Column | Current | Fixed |
|--------|---------|-------|
| owner_id | `v_todo->>'owner_id'` | `(v_todo->>'owner_id')::uuid` |
| assigned_to | `v_todo->>'owner_id'` | `(v_todo->>'owner_id')::uuid` |
| due_date | `(v_todo->>'due_date')::date` | Already correct |

The rest of the function logic (permissions, audit logging) remains unchanged.

---

## Expected Behaviour After Fix

1. User adds to-dos in the Solve tab of IDS dialog
2. User clicks "Mark as Solved"
3. Status transitions complete successfully (Open to Discussing to Solved)
4. To-dos are created without type errors
5. Toast shows "To-dos created successfully"
6. Dialog closes
