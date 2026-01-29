
# Plan: Sync Package Stages from Unicorn1

## Overview

Truncate `public.package_stages` and insert the 171 valid records from `unicorn1.package_stages`.

## Data Summary

| Source | Records |
|--------|---------|
| Current `public.package_stages` | 9 (incomplete) |
| `unicorn1.package_stages` with valid packages | 171 |

All 171 unicorn1 records have valid `stage_id` values that exist in `public.stages`.

## Migration Steps

### Step 1: Truncate Existing Data

Clear the 9 incomplete records from `public.package_stages`.

### Step 2: Insert Unicorn1 Data

Map the unicorn1 columns to public columns:

| Unicorn1 | Public | Notes |
|----------|--------|-------|
| `package_id` | `package_id` | Direct |
| `stage_id` | `stage_id` | Direct (references `stages.id`) |
| `ordernumber` | `sort_order` | Rename |
| — | `is_required` | Default `true` |
| — | `update_policy` | Default `'manual'` |
| — | `use_overrides` | Default `false` |

---

## Technical Details

### SQL Migration

```sql
-- Step 1: Truncate existing incomplete data
TRUNCATE public.package_stages RESTART IDENTITY CASCADE;

-- Step 2: Insert unicorn1 data
INSERT INTO public.package_stages (
  package_id, 
  stage_id, 
  sort_order, 
  is_required, 
  update_policy, 
  use_overrides,
  created_at
)
SELECT 
  ups.package_id,
  ups.stage_id,
  ups.ordernumber,
  true,
  'manual',
  false,
  COALESCE(ups.dateimported, NOW())
FROM unicorn1.package_stages ups
WHERE EXISTS (SELECT 1 FROM public.packages p WHERE p.id = ups.package_id);
```

### Frontend Updates Required

Files that join `package_stages` with `documents_stages` will need updating to use `stages` instead:

- `src/hooks/useStageDependencies.tsx`
- `src/hooks/usePackageStageOverrides.tsx`
- `src/pages/CalendarTimeCapture.tsx`
- `src/components/package-builder/PackageBuilderOverview.tsx`
- `src/hooks/usePackageBuilder.tsx`

These will change from:
```typescript
.select('stage:documents_stages(id, title)')
```
To:
```typescript
.select('stage:stages(id, name, shortname)')
```

---

## Expected Outcome

- 171 package stage records synced
- Consistent with `stages` table (source of truth)
- Frontend displays stage names correctly
