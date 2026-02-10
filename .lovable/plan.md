

## Fix: Supabase 1,000-Row Default Limit Truncating TGA Scope Data

### Problem

Supabase's JavaScript client returns a maximum of **1,000 rows** by default. Tenant 7512 has **2,312 scope items** in the database. The query on line 311 of `useTgaRtoData.tsx` fetches all scope types in a single query with no explicit limit override:

```typescript
supabase.from('tenant_rto_scope').select('*').eq('tenant_id', tenantId).order('code')
```

Only the first 1,000 rows (alphabetically by code) are returned, silently dropping 1,312 items. This explains why the sync toast shows the correct totals but the UI tabs show much less.

**Actual DB counts vs what the UI displays:**

| Type | In DB (Current+Superseded) | Shown in UI | Missing |
|---|---|---|---|
| Qualifications | 33 | 18 | 15 |
| Skill Sets | 162 | 53 | 109 |
| Units | 1,920 | 882 | 1,038 |
| Training Packages | 50 | 6 | 44 |
| Courses | 0 | 0 | 0 |
| **Total** | **2,165** | **959** | **1,206** |

### Solution

Split the single query into separate queries per scope type, each with an explicit high limit. This avoids hitting the 1,000-row cap and is also more efficient since the data is already being filtered by type in the mapping logic.

### Changes Required

**File: `src/hooks/useTgaRtoData.tsx`** (lines ~305-313)

Replace the single `tenant_rto_scope` query with five parallel queries, one per scope type, each with a generous limit:

```typescript
// Fetch scope data by type to avoid Supabase's 1000-row default limit
supabase.from('tenant_rto_scope').select('*')
  .eq('tenant_id', tenantId).eq('scope_type', 'qualification').order('code'),
supabase.from('tenant_rto_scope').select('*')
  .eq('tenant_id', tenantId).eq('scope_type', 'unit').order('code'),
supabase.from('tenant_rto_scope').select('*')
  .eq('tenant_id', tenantId).eq('scope_type', 'skillset').order('code'),
supabase.from('tenant_rto_scope').select('*')
  .eq('tenant_id', tenantId).eq('scope_type', 'accreditedCourse').order('code'),
supabase.from('tenant_rto_scope').select('*')
  .eq('tenant_id', tenantId).eq('scope_type', 'trainingPackage').order('code'),
```

Each type-specific query will return well under 1,000 rows (the largest is units at ~2,000, so those will need `.limit(5000)` or similar).

Alternatively, a simpler approach: just add `.limit(10000)` to the existing single query. This is the minimal change.

**Recommended approach (minimal change):**

Line 311 -- add `.limit(10000)`:

```typescript
supabase.from('tenant_rto_scope').select('*').eq('tenant_id', tenantId).order('code').limit(10000),
```

This single-line fix resolves the issue for all current and foreseeable RTOs. No database, edge function, or other UI changes needed.

