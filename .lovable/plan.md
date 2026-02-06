

# RLS Helper Functions Consolidation Plan

## Summary
This plan consolidates the scattered RLS helper functions into a unified, consistent set that follows the common predicate patterns provided. The consolidation addresses:
- Multiple overlapping functions with inconsistent implementations
- Missing `archived` flag checks in tenant access predicates
- Inconsistent handling between `tenant_users` and `tenant_members` tables
- Functions that don't follow recursion-safe patterns

---

## Current State Analysis

### Existing Functions (Duplicated/Overlapping)

| Function | Purpose | Issues |
|----------|---------|--------|
| `is_staff()` | Check Vivacity Team role | ✅ Working, checks both `global_role` and `unicorn_role` |
| `is_super_admin()` | Check SuperAdmin role | Only checks `global_role = 'SuperAdmin'`, misses `unicorn_role = 'Super Admin'` |
| `is_vivacity_team()` | Check Vivacity Team (no args) | Doesn't check `archived` flag |
| `is_vivacity_team_user(uuid)` | Check Vivacity Team (with arg) | ✅ Checks `archived` |
| `is_vivacity_team_v2(uuid)` | Check Vivacity Team + auth.users join | ✅ Checks `archived`, validates auth account |
| `is_vivacity_team_safe(uuid)` | Recursion-safe version | ✅ Sets `row_security = off` |
| `user_has_tenant_access(bigint)` | Tenant access via `tenant_users` | ❌ No `archived` check, queries wrong table |
| `user_has_tenant_access_safe(bigint, uuid)` | Recursion-safe version | ❌ No status/archived check |
| `has_tenant_access(bigint)` | Tenant access via `tenant_members` | ✅ Checks `status = 'active'` |
| `has_tenant_admin(bigint)` | Tenant admin via `tenant_members` | ✅ Checks `status = 'active'` + `role = 'Admin'` |
| `user_in_tenant(bigint)` | Legacy check via `users.tenant_id` | ❌ No status check, uses legacy model |
| `user_in_tenant_uuid(uuid)` | UUID tenant check via `tenant_users` | ❌ No status/archived check |

### Table Differences
- **`tenant_users`**: Has `role` column but NO `archived` or `status` column
- **`tenant_members`**: Has `role` and `status` columns (active/inactive/pending)

---

## Proposed Consolidated Function Set

### Core Predicates (3 Functions)

```text
┌─────────────────────────────────────────────────────────────────────┐
│                    UNIFIED RLS HELPER FUNCTIONS                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  A) is_vivacity_team_safe(p_user_id uuid)                           │
│     └── Returns true if user has Vivacity Team role                 │
│     └── Checks: unicorn_role IN ('Super Admin', 'Team Leader',      │
│                 'Team Member') AND archived IS DISTINCT FROM true   │
│     └── SECURITY DEFINER + row_security = off                       │
│                                                                      │
│  B) has_tenant_access_safe(p_tenant_id bigint, p_user_id uuid)      │
│     └── Returns true if SuperAdmin OR has active tenant membership  │
│     └── Checks: tenant_members.status = 'active'                    │
│     └── SECURITY DEFINER + row_security = off                       │
│                                                                      │
│  C) is_super_admin_safe(p_user_id uuid)                             │
│     └── Returns true if user is SuperAdmin                          │
│     └── Checks: unicorn_role = 'Super Admin' OR                     │
│                 global_role = 'SuperAdmin'                          │
│     └── SECURITY DEFINER + row_security = off                       │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Convenience Wrappers (No-Arg Versions)

```text
┌─────────────────────────────────────────────────────────────────────┐
│                    CONVENIENCE WRAPPERS                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  is_vivacity_team() → is_vivacity_team_safe(auth.uid())             │
│  is_super_admin()   → is_super_admin_safe(auth.uid())               │
│  has_tenant_access(tenant_id) → has_tenant_access_safe(id, uid())   │
│                                                                      │
│  Note: These are NOT used in RLS policies directly                  │
│        (to avoid function ambiguity errors)                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Create New Unified Functions

**1a. `is_super_admin_safe(uuid)`** - Recursion-safe SuperAdmin check
```sql
CREATE OR REPLACE FUNCTION public.is_super_admin_safe(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = p_user_id
      AND (
        unicorn_role = 'Super Admin'
        OR global_role = 'SuperAdmin'
      )
      AND archived IS DISTINCT FROM true
  );
$$;
```

**1b. `has_tenant_access_safe(bigint, uuid)`** - Recursion-safe tenant access check
```sql
CREATE OR REPLACE FUNCTION public.has_tenant_access_safe(p_tenant_id bigint, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT 
    public.is_super_admin_safe(p_user_id)
    OR public.is_vivacity_team_safe(p_user_id)
    OR EXISTS (
      SELECT 1 FROM public.tenant_members
      WHERE tenant_id = p_tenant_id
        AND user_id = p_user_id
        AND status = 'active'
    );
$$;
```

**1c. `has_tenant_admin_safe(bigint, uuid)`** - Recursion-safe tenant admin check
```sql
CREATE OR REPLACE FUNCTION public.has_tenant_admin_safe(p_tenant_id bigint, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT 
    public.is_super_admin_safe(p_user_id)
    OR EXISTS (
      SELECT 1 FROM public.tenant_members
      WHERE tenant_id = p_tenant_id
        AND user_id = p_user_id
        AND role = 'Admin'
        AND status = 'active'
    );
$$;
```

### Step 2: Update Existing Functions

Update `is_vivacity_team_safe()` to ensure consistency (already correct but will be verified/reapplied).

Update `is_super_admin()` to check both role columns:
```sql
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_super_admin_safe(auth.uid());
$$;
```

Update `has_tenant_access()` to use the safe version:
```sql
CREATE OR REPLACE FUNCTION public.has_tenant_access(_tenant_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_tenant_access_safe(_tenant_id, auth.uid());
$$;
```

### Step 3: Deprecate Legacy Functions

Mark these functions as deprecated (add comments) but keep them for backward compatibility:
- `user_has_tenant_access(bigint)` → Use `has_tenant_access_safe(bigint, uuid)`
- `user_in_tenant(bigint)` → Use `has_tenant_access_safe(bigint, uuid)`
- `is_vivacity_team_user(uuid)` → Use `is_vivacity_team_safe(uuid)`
- `is_vivacity_team_v2(uuid)` → Use `is_vivacity_team_safe(uuid)`

### Step 4: Update Edge Function RBAC

Update `supabase/functions/_shared/addin-auth.ts` to use the new RPC for tenant access:
```typescript
// In verifyClientAccess():
const { data: access } = await supabaseAdmin.rpc('has_tenant_access_safe', {
  p_tenant_id: clientIdNum,
  p_user_id: userUuid,
});
```

### Step 5: Grant Execute Permissions

```sql
GRANT EXECUTE ON FUNCTION public.is_super_admin_safe(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_tenant_access_safe(bigint, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_tenant_admin_safe(bigint, uuid) TO authenticated;
```

---

## Technical Details

### Function Naming Convention

| Pattern | Example | Use Case |
|---------|---------|----------|
| `*_safe(args)` | `is_vivacity_team_safe(uuid)` | RLS policies (recursion-safe) |
| `*()` (no args) | `is_super_admin()` | Application code, non-RLS contexts |

### Recursion Prevention Pattern

All `*_safe` functions include:
```sql
SECURITY DEFINER
SET search_path = public
SET row_security = off
```

This bypasses RLS on queried tables, preventing infinite recursion when these functions are called from RLS policies.

### Status/Archived Checks

| Table | Check |
|-------|-------|
| `users` | `archived IS DISTINCT FROM true` |
| `tenant_members` | `status = 'active'` |

**Note:** The `tenant_users` table has no status column - access checks should use `tenant_members` instead.

---

## Files to be Modified

1. **New Migration File**: `supabase/migrations/YYYYMMDD_consolidate_rls_helpers.sql`
   - Create new unified functions
   - Update existing wrappers
   - Add deprecation comments
   - Grant permissions

2. **Edge Functions**: `supabase/functions/_shared/addin-auth.ts`
   - Update `verifyClientAccess()` to use new RPC

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing RLS policies | Keep existing function signatures working as wrappers |
| Function ambiguity errors | Use explicit parameter versions in RLS policies |
| Performance impact | All functions are `STABLE` and use indexes |
| Missing archived checks | New functions enforce archived/status checks |

---

## Validation Criteria

1. All RLS policies using tenant access check `status = 'active'` via the new functions
2. SuperAdmin check validates both `unicorn_role` and `global_role`
3. Vivacity Team check validates `archived IS DISTINCT FROM true`
4. No function ambiguity errors in RLS policy evaluation
5. Edge function RBAC uses the consolidated helpers

