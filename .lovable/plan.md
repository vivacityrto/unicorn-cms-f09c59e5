

# Fix SharePoint Settings Save Error

## Problem
Saving a SharePoint folder link fails because of two database-level issues preventing any insert or update on `tenant_sharepoint_settings`:

1. **Audit trigger type mismatch** -- The `audit_tenant_sharepoint_settings` trigger casts `NEW.id::text`, but the `audit_events.entity_id` column is type `uuid`. PostgreSQL rejects the implicit `text -> uuid` assignment, rolling back the entire transaction.

2. **Missing RLS helper function** -- The INSERT policy references `is_vivacity_team_safe(auth.uid())`, but that function does not exist in the database. Any insert attempt fails the RLS check immediately.

## Solution

A single database migration that:

1. **Fixes the audit trigger** -- Removes the `::text` cast so `NEW.id` (already a `uuid`) is passed directly to `entity_id`.

2. **Creates the missing `is_vivacity_team_safe` function** -- A thin wrapper matching the existing pattern (e.g. `is_vivacity_internal_safe`), defined as `SECURITY DEFINER` to avoid RLS recursion. It will check whether the given user has a Vivacity staff role (Super Admin, Team Leader, or Team Member).

## Technical Details

### Migration SQL (single migration)

**Step 1 -- Create `is_vivacity_team_safe`**

```sql
CREATE OR REPLACE FUNCTION public.is_vivacity_team_safe(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE user_uuid = p_user_id
      AND unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_vivacity_team_safe(uuid) TO authenticated;
```

**Step 2 -- Fix the audit trigger function**

Replace every occurrence of `NEW.id::text` and `OLD.id::text` with `NEW.id` and `OLD.id` respectively in the `audit_tenant_sharepoint_settings()` function body. No other logic changes.

### What this fixes
- The "Save Link" button will successfully insert a new row into `tenant_sharepoint_settings`.
- The audit trigger will correctly log the action to `audit_events`.
- No code changes are needed -- the frontend already handles the save correctly.

### Risk
- Low risk. The trigger fix is a simple cast removal. The new function follows the established pattern of other `_safe` helper functions in the project.

