
# Fix CSC User Selection Query

## Problem Identified

The query to fetch available CSC users is returning empty because of conflicting filter conditions:

| User | `is_team` | `staff_team` | `disabled` | `archived` |
|------|-----------|--------------|------------|------------|
| Kelly Xu | NULL | client_success | false | false |
| Sharwari Rajurkar | NULL | client_success | false | false |
| Angela Connell-Richards | false | NULL | false | true |

The current query requires **both** `is_team = true` **AND** `staff_team = 'client_success'`, but users with a `staff_team` value have `is_team` set to `NULL`.

## Solution

Remove the `is_team = true` filter since the `staff_team = 'client_success'` filter is sufficient to identify Client Success Team members.

## Implementation

**File: `src/hooks/useTenantCSCAssignment.tsx`**

Update the query at lines 70-77:

```typescript
// Current query (broken):
const { data, error } = await supabase
  .from('users')
  .select('user_uuid, first_name, last_name, email, job_title, avatar_url')
  .eq('is_team', true)           // Remove this filter
  .eq('disabled', false)
  .eq('archived', false)
  .eq('staff_team', 'client_success')
  .order('first_name', { ascending: true });

// Fixed query:
const { data, error } = await supabase
  .from('users')
  .select('user_uuid, first_name, last_name, email, job_title, avatar_url')
  .eq('disabled', false)
  .eq('archived', false)
  .eq('staff_team', 'client_success')
  .order('first_name', { ascending: true });
```

## Result

After this change, the CSC assignment dialog will show Kelly Xu and Sharwari Rajurkar (the active Client Success Team members).

## Files Modified

| File | Change |
|------|--------|
| `src/hooks/useTenantCSCAssignment.tsx` | Remove `.eq('is_team', true)` filter |
