

# RLS Standardization: document_links Table

## Current State
- **Table**: `public.document_links`
- **RLS**: Already enabled
- **Existing Policies** (6 total, overlapping and legacy):

| Policy Name | Operation | Logic | Issues |
|-------------|-----------|-------|--------|
| `document_links_select` | SELECT | `*_safe` helpers with tenant access | ✓ Already standardized |
| `document_links_manage` | ALL | `*_safe` helpers with tenant access | ✓ Already standardized but overly broad |
| `document_links_select_policy` | SELECT | Legacy `role = 'SuperAdmin'` check, broken client tenant check | ❌ Duplicate, uses wrong column |
| `document_links_insert_policy` | INSERT | `user_uuid = auth.uid()` only | ❌ No tenant validation |
| `document_links_update_policy` | UPDATE | Legacy `role = 'SuperAdmin'` | ❌ Uses wrong role column |
| `document_links_delete_policy` | DELETE | Legacy `role = 'SuperAdmin'` | ❌ Uses wrong role column |

**Critical Issue**: The `*_policy` suffix policies use the legacy `role` column instead of `unicorn_role`, and the `document_links_manage` policy is a catch-all that may conflict with operation-specific policies.

---

## Schema Discovery

### document_links columns (entity links):
| Column | Type | Notes |
|--------|------|-------|
| `tenant_id` | integer | Required, tenant isolation |
| `user_uuid` | uuid | Creator |
| `client_id` | integer | Nullable, link to client |
| `package_id` | integer | Nullable, link to package |
| `process_id` | uuid | Nullable, link to process |
| `task_id` | uuid | Nullable, link to task |
| `meeting_id` | uuid | Nullable, link to meeting |

### Tenant Access Helper:
The `has_tenant_access_safe(p_tenant_id, p_user_id)` function already handles:
- SuperAdmin access via `is_super_admin_safe()`
- Vivacity team access via `is_vivacity_team_safe()`
- Active tenant membership via `tenant_members`

---

## Planned Changes

### 1. DROP All Existing Policies
Remove 6 overlapping/legacy policies to replace with clean standardized versions.

### 2. CREATE Standardized Policies

| Operation | Policy Name | Logic |
|-----------|-------------|-------|
| **SELECT** | `document_links_select` | Creator OR tenant access OR SuperAdmin |
| **INSERT** | `document_links_insert` | Creator with tenant access |
| **UPDATE** | `document_links_update` | Creator OR SuperAdmin |
| **DELETE** | `document_links_delete` | SuperAdmin only |

### 3. Policy Definitions

**SELECT** — Creator, users with tenant access, or SuperAdmin
```sql
CREATE POLICY "document_links_select"
ON public.document_links
FOR SELECT TO authenticated
USING (
  user_uuid = auth.uid()
  OR public.has_tenant_access_safe(tenant_id::bigint, auth.uid())
);
```
Note: `has_tenant_access_safe` already includes SuperAdmin and Vivacity team checks internally.

**INSERT** — Creator with tenant access validation
```sql
CREATE POLICY "document_links_insert"
ON public.document_links
FOR INSERT TO authenticated
WITH CHECK (
  user_uuid = auth.uid()
  AND public.has_tenant_access_safe(tenant_id::bigint, auth.uid())
);
```

**UPDATE** — Creator or SuperAdmin only
```sql
CREATE POLICY "document_links_update"
ON public.document_links
FOR UPDATE TO authenticated
USING (
  user_uuid = auth.uid()
  OR public.is_super_admin_safe(auth.uid())
)
WITH CHECK (
  user_uuid = auth.uid()
  OR public.is_super_admin_safe(auth.uid())
);
```

**DELETE** — SuperAdmin only
```sql
CREATE POLICY "document_links_delete"
ON public.document_links
FOR DELETE TO authenticated
USING (public.is_super_admin_safe(auth.uid()));
```

---

## Technical Details

### Entity-Based Access via Tenant
Your spec mentions checking access via `client_id → clients.tenant_id`. However, `document_links` already has its own `tenant_id` column which is set at creation time. Using `has_tenant_access_safe(tenant_id)` is simpler and more efficient than joining through entity tables.

This approach:
- Grants SELECT to anyone in the same tenant (including clients linked via that tenant)
- Works for all entity types (clients, packages, tasks, meetings, processes)
- Avoids complex multi-table joins in RLS policies

### Spec Deviation: tenant_users vs tenant_members
Your spec references `tenant_users.archived = false`, but the project uses `tenant_members.status = 'active'`. The `has_tenant_access_safe()` helper already uses the correct table and column.

### Update WITH CHECK
Your spec uses `WITH CHECK (true)` for UPDATE. I've strengthened this to require creator OR SuperAdmin to prevent unauthorized field changes.

---

## Migration Summary
A single migration will:
1. Drop 6 existing overlapping/legacy policies
2. Create 4 clean standardized policies using `*_safe` functions

---

## Impact Assessment
- **Cleaner policy set** — Reduces from 6 overlapping policies to 4 focused ones
- **Legacy patterns removed** — No more `role = 'SuperAdmin'` checks
- **Tenant isolation maintained** — Via `has_tenant_access_safe()`
- **Stricter UPDATE** — Now requires creator or SuperAdmin (was allowing any field change)
- **No code changes needed** — RLS is transparent to the frontend

