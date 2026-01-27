
# Plan: Populate public.stages from unicorn1.stages + Fix Build Errors

## Overview

This plan covers two key tasks:
1. **Database Migration**: Populate `public.stages` from `unicorn1.stages` master data
2. **Code Fix**: Replace deprecated `client_packages` table usage with `package_instances` and fix FK join issues

---

## Part 1: Database Migration — Populate public.stages

### What will happen
The `public.stages` table (currently empty) will be populated with the 74 records from `unicorn1.stages` (legacy master data).

### Migration Script
```sql
-- Reset the stages table (confirmed safe - no FK constraints)
TRUNCATE TABLE public.stages;

-- Copy all stage records from unicorn1 using legacy IDs
INSERT INTO public.stages (id, name, shortname, description, videourl, dateimported)
OVERRIDING SYSTEM VALUE
SELECT id, name, shortname, description, videourl, dateimported
FROM unicorn1.stages;

-- Reset the sequence to prevent ID conflicts
SELECT setval(
  pg_get_serial_sequence('public.stages', 'id'), 
  (SELECT COALESCE(MAX(id), 0) + 1 FROM public.stages), 
  false
);
```

### Validation
After running, the console will report:
- Total records inserted
- ID range (min/max)

---

## Part 2: Fix TypeScript Build Errors

### Problem
Several files query tables using FK join syntax (e.g., `tenants.packages(...)` or `client_packages.packages(...)`). These break because:
1. FK constraints were dropped in Phase 1
2. The codebase should use `package_instances` as the source of truth (not `client_packages`)

### Files to Update

| File | Issue | Fix |
|------|-------|-----|
| `useClientPackageInstances.tsx` | Queries `client_packages` table | Replace with `package_instances` |
| `TenantDetail.tsx` | Uses `tenants.packages(...)` join | Use parallel queries or `package_instances` |
| `TenantNotes.tsx` | Uses `tenants.packages(...)` join | Use parallel query pattern |
| `TimeInbox.tsx` | Queries `client_packages` | Replace with `package_instances` |
| `CalendarTimeCapture.tsx` | Queries `client_packages` | Replace with `package_instances` |
| `ClientWorkboardTab.tsx` | Queries `client_packages` | Replace with `package_instances` |
| `usePackageUsage.tsx` | Queries `client_packages` | Replace with `package_instances` |
| `useStageSimulation.tsx` | Queries `client_packages` | Replace with `package_instances` |

### Fix Pattern

**Before (broken)**:
```typescript
const { data } = await supabase
  .from("tenants")
  .select("name, packages(name)")
  .eq("id", tenantId)
  .single();
```

**After (parallel queries)**:
```typescript
// Fetch tenant name
const { data: tenantData } = await supabase
  .from("tenants")
  .select("name")
  .eq("id", tenantId)
  .single();

// Fetch active package via package_instances
const { data: instanceData } = await supabase
  .from("package_instances")
  .select("package_id")
  .eq("tenant_id", tenantId)
  .eq("is_complete", false)
  .limit(1)
  .maybeSingle();

// Fetch package name if exists
let packageName = "";
if (instanceData?.package_id) {
  const { data: pkgData } = await supabase
    .from("packages")
    .select("name")
    .eq("id", instanceData.package_id)
    .single();
  packageName = pkgData?.name || "";
}
```

---

## Technical Details

### Schema Comparison

| Column | unicorn1.stages | public.stages |
|--------|-----------------|---------------|
| id | integer | integer |
| name | text | text |
| shortname | text | text |
| description | text | text |
| videourl | text | text |
| dateimported | timestamp | timestamp |

### package_instances vs client_packages

| Aspect | package_instances (use this) | client_packages (deprecated) |
|--------|------------------------------|------------------------------|
| ID type | bigint | UUID |
| Records | Has data | 0 records |
| Status | Source of truth | To be removed |
| Active filter | `is_complete = false` | `status IN ('active', 'in_progress')` |

---

## Execution Order

1. Run the stages population migration
2. Update `TenantNotes.tsx` to use parallel queries
3. Update `TenantDetail.tsx` to remove `packages(...)` join
4. Update `useClientPackageInstances.tsx` to use `package_instances`
5. Update remaining files (`TimeInbox.tsx`, `CalendarTimeCapture.tsx`, etc.)
6. Test build to confirm no TypeScript errors

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| public.stages truncation | Confirmed 0 records, no FK constraints |
| Breaking existing queries | `package_instances` has data; `client_packages` is empty |
| ID type mismatch | `package_instances.id` is bigint; interfaces will be updated |
