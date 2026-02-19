
## Root Cause Analysis — All Three Blocking Issues Found

### Issue 1: No Foreign Key — PostgREST Cannot Resolve the Join (PRIMARY CAUSE)

The `tenant_users` table has **zero foreign key constraints** (confirmed by querying `pg_constraint` — only a primary key and a unique key exist). There is no FK from `tenant_users.user_id` to `public.users(user_uuid)`.

PostgREST uses FK constraints to discover relationships. Without one, the query in `TenantUsersTab.tsx`:
```
users!inner ( user_uuid, email, first_name, ... )
```
...cannot resolve. PostgREST doesn't know `tenant_users.user_id` maps to `users.user_uuid`, so it returns an error or empty set — and since the component only logs but swallows the error, nothing appears in the UI.

### Issue 2: RLS SELECT Policy Blocks SuperAdmin (SECONDARY CAUSE)

The `tenant_users_select` policy currently reads:
```sql
USING ((user_id = auth.uid()) OR is_tenant_parent_safe(tenant_id, auth.uid()))
```

Dave (the SuperAdmin) has `auth.uid()` = `551f13b0...`. For tenant 7535:
- `user_id = auth.uid()` → FALSE (Dave is not in tenant_users for tenant 7535)
- `is_tenant_parent_safe(7535, Dave's UUID)` → FALSE (Dave has no row in tenant_users for 7535)

**Result: zero rows visible.** The SuperAdmin cannot see any tenant_users records for tenants they are not explicitly a member of.

### Issue 3: Role CHECK Constraint Mismatch (TERTIARY CAUSE)

The `tenant_users` table has a CHECK constraint:
```sql
CHECK ((role = ANY (ARRAY['parent'::text, 'child'::text])))
```

But the component queries and displays roles as `'Admin'` and `'General User'`. The existing data has `role = 'parent'` for Hamid's row. Any role update attempt would fail the constraint. This is a data model mismatch that needs resolving.

---

## The Fix Plan

### Fix 1 — Add Foreign Key Constraint (Database Migration)

Add the FK so PostgREST can resolve the `users!inner` join:

```sql
ALTER TABLE public.tenant_users
  ADD CONSTRAINT tenant_users_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(user_uuid)
  ON DELETE CASCADE;
```

### Fix 2 — Update RLS SELECT Policy to Allow SuperAdmin Access (Database Migration)

Replace the `tenant_users_select` policy to also permit Vivacity staff (using the existing `is_vivacity_staff` and `is_super_admin_safe` helper functions that already exist in the database):

```sql
DROP POLICY IF EXISTS tenant_users_select ON public.tenant_users;

CREATE POLICY tenant_users_select ON public.tenant_users
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR is_tenant_parent_safe(tenant_id, auth.uid())
    OR is_super_admin_safe(auth.uid())
    OR is_vivacity_staff(auth.uid())
  );
```

### Fix 3 — Update Component Query to Use Explicit FK Hint

After the FK is added (named `tenant_users_user_id_fkey`), update the Supabase query in `TenantUsersTab.tsx` to use the explicit FK relationship name, avoiding any ambiguity:

```typescript
const { data, error } = await supabase
  .from('tenant_users')
  .select(`
    user_id,
    role,
    created_at,
    users!tenant_users_user_id_fkey (
      user_uuid,
      email,
      first_name,
      last_name,
      avatar_url,
      created_at
    )
  `)
  .eq('tenant_id', tenantId)
  .order('created_at', { ascending: false });
```

Also add error logging so failures surface in future:
```typescript
if (error) {
  console.error('tenant_users fetch error:', error);
  throw error;
}
```

### Fix 4 — Role Display: Map 'parent'/'child' to Readable Labels

The existing data uses `role = 'parent'` (from the CHECK constraint). The UI currently tries to match against `'Admin'` and `'General User'`. Rather than breaking the DB constraint, the component should display `parent` as "Primary Contact" and `child` as "User", which reflects the actual meaning:

```typescript
const getRoleLabel = (role: string) => {
  if (role === 'parent') return 'Primary Contact';
  if (role === 'child') return 'User';
  return role;
};
```

The role-change dropdown will also be updated to use `parent`/`child` values to match the DB constraint.

---

## Files and Changes Summary

**Database migrations (2 SQL statements):**
1. Add FK constraint: `tenant_users.user_id → users.user_uuid`
2. Update `tenant_users_select` RLS policy to allow SuperAdmin and Vivacity staff

**`src/components/client/TenantUsersTab.tsx`:**
- Update join hint from `users!inner` to `users!tenant_users_user_id_fkey`
- Add visible error logging to `fetchMembers`
- Update role display to map `parent`/`child` to readable labels
- Update role-change Select to use `parent`/`child` as values

**No other files change.**

---

## Verification Expected After Fix

- Tenant 7535 has 1 row: `user_id = 4c74bb86...` (Hamid Iskeirjeh, hamid@adelaideaviation.com.au, role = parent)
- After Fix 1 + 2: the network request to `tenant_users?tenant_id=eq.7535&select=user_id,role,created_at,users!...` will return that row
- After Fix 3: the row will render in the UI showing Hamid with role "Primary Contact"
