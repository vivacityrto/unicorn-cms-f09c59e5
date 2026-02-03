
# Restrict CSC Selection to Client Success Team Only

## Change Required

Update the `useTenantCSCAssignment` hook to filter users by `staff_team_type = 'client_success'`.

## Implementation

**File: `src/hooks/useTenantCSCAssignment.tsx`**

Add a filter to the `availableCSCs` query at line 75:

```typescript
const { data, error } = await supabase
  .from('users')
  .select('user_uuid, first_name, last_name, email, job_title, avatar_url')
  .eq('is_team', true)
  .eq('disabled', false)
  .eq('archived', false)
  .eq('staff_team_type', 'client_success')  // Only Client Success Team members
  .order('first_name', { ascending: true });
```

## Result

Only users assigned to the "Client Success Team" (Angela Connell-Richards, Sharwari Rajurkar, Sam Holtham, Kelly Xu, etc.) will appear in the CSC assignment dropdown.

## Files Modified

| File | Change |
|------|--------|
| `src/hooks/useTenantCSCAssignment.tsx` | Add `.eq('staff_team_type', 'client_success')` filter |
