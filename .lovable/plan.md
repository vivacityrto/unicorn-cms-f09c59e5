
# RLS Standardization: email_messages Table

## Summary
Migrate the `email_messages` table policies from legacy functions to recursion-safe helper functions, implementing stricter access controls as specified.

---

## Current State
- **Table**: `public.email_messages` (not `email_records`)
- **RLS**: Already enabled
- **Existing Policies** (using legacy functions):
  - `email_messages_select_own` — `user_uuid = auth.uid()`
  - `email_messages_select_superadmin` — `is_super_admin()`
  - `email_messages_insert_own` — `user_uuid = auth.uid()`
  - `email_messages_update_own` — `user_uuid = auth.uid()`
  - `email_messages_delete_superadmin` — `is_super_admin()`

---

## Planned Changes

### 1. DROP Existing Policies
Remove all 5 legacy policies to replace with standardized versions.

### 2. CREATE Standardized Policies

| Operation | Policy Name | Logic |
|-----------|-------------|-------|
| **SELECT** | `email_messages_select` | Own record OR SuperAdmin |
| **INSERT** | `email_messages_insert` | Own record AND Vivacity Team AND tenant access |
| **UPDATE** | `email_messages_update` | Own record only |
| **DELETE** | `email_messages_delete` | SuperAdmin only |

### 3. Policy Definitions

**SELECT** — Owner or SuperAdmin
```sql
CREATE POLICY "email_messages_select"
ON public.email_messages
FOR SELECT TO authenticated
USING (
  user_uuid = auth.uid()
  OR public.is_super_admin_safe(auth.uid())
);
```

**INSERT** — Vivacity Team with tenant access
```sql
CREATE POLICY "email_messages_insert"
ON public.email_messages
FOR INSERT TO authenticated
WITH CHECK (
  user_uuid = auth.uid()
  AND public.is_vivacity_team_safe(auth.uid())
  AND public.has_tenant_access_safe(tenant_id, auth.uid())
);
```

**UPDATE** — Owner only (linking fields: client_id, package_id, task_id)
```sql
CREATE POLICY "email_messages_update"
ON public.email_messages
FOR UPDATE TO authenticated
USING (user_uuid = auth.uid())
WITH CHECK (user_uuid = auth.uid());
```

**DELETE** — SuperAdmin only
```sql
CREATE POLICY "email_messages_delete"
ON public.email_messages
FOR DELETE TO authenticated
USING (public.is_super_admin_safe(auth.uid()));
```

---

## Technical Details

### Why Stricter INSERT Policy?
The specification requires:
1. **user_uuid = auth.uid()** — Must match authenticated user
2. **Vivacity Team role** — Only Super Admin, Team Leader, Team Member can link emails
3. **Tenant access** — User must have access to the specified tenant

This prevents clients from linking emails (internal feature only) and ensures proper tenant isolation.

### Edge Function Compatibility
The `capture-outlook-email` edge function uses the user's JWT context (line 31-35), so RLS policies apply. The function will correctly enforce:
- User identity via `user_uuid = auth.uid()`
- Vivacity Team membership via `is_vivacity_team_safe()`
- Tenant access via `has_tenant_access_safe()`

### Column-Level UPDATE Restrictions (Optional)
Your spec mentions restricting UPDATE to linking columns only. This requires SQL GRANT/REVOKE which is outside RLS. The RLS policy enforces ownership; column restrictions would need a separate migration.

---

## Migration File
A single migration will:
1. Drop 5 existing policies
2. Create 4 standardized policies using `*_safe` functions

---

## Impact Assessment
- **No frontend changes required** — Hook uses same table name
- **No edge function changes required** — Already uses user JWT context
- **Access tightened** — Only Vivacity Team can INSERT (was any authenticated user)
