

# RLS Standardization: time_entries Table

## Current State
- **Table**: `public.time_entries`
- **RLS**: Already enabled
- **Existing Policies** (6 total, mix of legacy and standardized):

| Policy Name | Operation | Roles | Logic | Issues |
|-------------|-----------|-------|-------|--------|
| `Users view own time entries` | SELECT | public | `user_id = auth.uid()` | Legacy, uses `public` role |
| `Managers view tenant time entries` | SELECT | public | Team Leader + connected_tenants check | Legacy pattern, uses `public` role |
| `time_entries_select` | SELECT | authenticated | `*_safe` helpers + tenant access | ✓ Standardized but overlaps with above |
| `time_entries_insert` | INSERT | authenticated | Owner + tenant access | ✓ Already standardized |
| `time_entries_update` | UPDATE | authenticated | Owner OR Vivacity team | ⚠️ No WITH CHECK clause |
| `time_entries_delete` | DELETE | authenticated | SuperAdmin OR owner | ✓ Already standardized |

---

## Schema Analysis

### Existing Columns:
| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK, auto-generated |
| `tenant_id` | integer | Required |
| `client_id` | integer | Required |
| `user_id` | uuid | Required, owner |
| `duration_minutes` | integer | Required |
| `work_type` | text | Default 'general' |
| `is_billable` | boolean | Default true |
| `source` | text | Default 'manual' |
| `start_at` / `end_at` | timestamptz | Nullable |

### Missing Column:
The spec references `status = 'draft'` for UPDATE restrictions, but **no `status` column exists**.

---

## Spec vs Current State Analysis

### Your Spec Requirements:
1. **SELECT**: Own time only (`user_id = auth.uid()`)
2. **INSERT**: Own drafts with tenant access
3. **UPDATE**: Own drafts only (`status = 'draft'`)
4. **DELETE**: Not explicitly defined (recommend owner + SuperAdmin)

### Current Implementation:
1. **SELECT**: More permissive — includes tenant access and Vivacity team
2. **INSERT**: Already matches spec ✓
3. **UPDATE**: No draft restriction (no status column), includes Vivacity team
4. **DELETE**: Owner OR SuperAdmin ✓

---

## Recommendation

Given the current state, I propose a **phased approach**:

### Phase A: Clean Up Overlapping Policies (This Migration)
Remove legacy `public` role policies and consolidate to single standardized policies.

### Phase B: Add Status Column (Future, if needed)
Add `status` enum ('draft', 'posted') to support the draft workflow.

---

## Planned Changes (Phase A)

### 1. DROP Legacy Policies
Remove 2 legacy policies with `public` role that overlap with standardized versions.

### 2. KEEP/MODIFY Standardized Policies

| Operation | Policy Name | Logic |
|-----------|-------------|-------|
| **SELECT** | `time_entries_select` | Simplified: Owner OR SuperAdmin OR Vivacity team |
| **INSERT** | `time_entries_insert` | Keep as-is (already correct) |
| **UPDATE** | `time_entries_update` | Add WITH CHECK clause for safety |
| **DELETE** | `time_entries_delete` | Keep as-is (already correct) |

### 3. Policy Definitions

**SELECT** — Simplified per spec (own time + SuperAdmin access)
```sql
CREATE POLICY "time_entries_select"
ON public.time_entries
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
);
```

Note: Removing `has_tenant_access_safe()` from SELECT aligns with spec's "own time only" requirement. Vivacity team and SuperAdmin access preserved for consulting visibility.

**INSERT** — Keep existing (already correct)
```sql
-- No changes needed
-- user_id = auth.uid() AND has_tenant_access_safe(tenant_id, auth.uid())
```

**UPDATE** — Add WITH CHECK clause
```sql
CREATE POLICY "time_entries_update"
ON public.time_entries
FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
)
WITH CHECK (
  user_id = auth.uid()
  OR public.is_super_admin_safe(auth.uid())
  OR public.is_vivacity_team_safe(auth.uid())
);
```

**DELETE** — Keep existing (already correct)
```sql
-- No changes needed
-- is_super_admin_safe(auth.uid()) OR user_id = auth.uid()
```

---

## Technical Details

### Draft/Posted Workflow (Deferred)
Your spec mentions restricting UPDATE to `status = 'draft'` entries only. This requires:
1. Adding a `time_entry_status` enum with values `draft`, `posted`
2. Adding a `status` column with default `draft`
3. Modifying UPDATE policy to include `AND status = 'draft'`
4. Optional: trigger to prevent status regression

This is **not included in this migration** as it's a schema change. If you want this workflow, I can propose a follow-up migration.

### Tenant Access Removed from SELECT
Current policy allows anyone with tenant access to see all entries in that tenant. The spec says "own time only" which is more restrictive. This change aligns with:
- Privacy: Users only see their own time entries
- Consulting: Vivacity team still sees all for billing/reporting purposes
- Admin: SuperAdmins retain full visibility

### Code Impact
The `useTimeEntriesQuery` hook filters by `client_id`, but RLS will now additionally filter to only the current user's entries (unless they're Vivacity team/SuperAdmin). This is the correct behavior for compliance.

---

## Migration Summary
A single migration will:
1. Drop 2 legacy `public` role policies
2. Drop and recreate `time_entries_select` with stricter logic
3. Drop and recreate `time_entries_update` with WITH CHECK clause
4. Keep INSERT and DELETE policies as-is

---

## Impact Assessment
- **Stricter SELECT** — Regular users now only see their own time entries
- **Vivacity team preserved** — Still has full visibility for consulting
- **WITH CHECK added** — Prevents UPDATE from changing ownership
- **Legacy cleanup** — No more overlapping policies with `public` role
- **No code changes needed** — Frontend already filters by client, RLS adds user filter

