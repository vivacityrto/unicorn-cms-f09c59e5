
# Fix "Could not find relationship between users and tenants" Error

## Problem Identified

When viewing or editing user profiles (like Nova Canto), the system shows:
- "User not found" 
- Error: "Could not find a relationship between 'users' and 'tenants' in the schema cache"

The queries in `UserProfile.tsx` and `TenantUsers.tsx` use Supabase's join syntax:
```javascript
.select(`..., tenants!tenant_id(name)`)
```

This syntax requires a **foreign key constraint** between `users.tenant_id` and `tenants.id`. That constraint is missing because it was dropped during the legacy ID migration.

## Data Validation

| Check | Result |
|-------|--------|
| `users.tenant_id` type | `bigint` |
| `tenants.id` type | `bigint` |
| FK constraint exists? | No |
| Orphaned records | 1 record (Dave Richards, tenant_id=216) |

The orphaned record references a deleted tenant and must be cleaned up before adding the FK.

## Solution

Create a migration that:
1. Sets orphaned `tenant_id` values to NULL
2. Adds the foreign key constraint

```sql
-- Step 1: Clean orphaned tenant references
UPDATE public.users
SET tenant_id = NULL, updated_at = now()
WHERE tenant_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.tenants WHERE id = users.tenant_id
  );

-- Step 2: Add the foreign key constraint
ALTER TABLE public.users
  ADD CONSTRAINT users_tenant_id_fkey
  FOREIGN KEY (tenant_id)
  REFERENCES public.tenants(id)
  ON DELETE SET NULL;
```

## Expected Results

After the migration:
- The User Profile page will load correctly for all users
- The Tenant Users page will display tenant names
- Both pages will use the existing join syntax without code changes
- Future orphaned references are prevented by the FK constraint

## Technical Details

### Files to Create

| File | Purpose |
|------|---------|
| `supabase/migrations/[timestamp]_add_users_tenant_fk.sql` | Add FK constraint between users and tenants |

### Impact

- Dave Richards' record will have `tenant_id` set to NULL (his tenant was deleted)
- No frontend code changes required
- Aligns with compliance principle of data integrity
