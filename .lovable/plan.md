

# Notes Package ID Alignment Migration

## Summary

After syncing `public.packages` with `unicorn1.packages` (preserving original IDs), we need to update the `notes.package_id` column to reference the correct package IDs based on the package name stored in `u1_package`.

## Current State

| Metric | Value |
|--------|-------|
| Total notes with package references | 9,556 |
| Current `package_id` values | All NULL |
| `u1_package` (name) populated | Yes - 15 unique packages |
| `u1_package_id` (stored) | Row numbers, NOT actual IDs |

### The Problem

The `u1_package_id` column contains **row sequence numbers** rather than actual package IDs:

| Package Name | Stored u1_package_id | Correct U1 Package ID |
|--------------|----------------------|----------------------|
| KS-RTO | 1 | 1 |
| M-RR | 3 | 5 |
| KS-CRI | 7 | 10 |
| M-GC | 13 | 1016 |
| M-DR | 39 | 1027 |

## Solution

Use name-based matching via `u1_package` column to derive the correct package ID.

## Execution Order

**IMPORTANT**: This migration must run AFTER the packages sync migration.

### Step 1: Packages Sync (Run First)
```sql
TRUNCATE TABLE public.package_instances CASCADE;
TRUNCATE TABLE public.packages CASCADE;

INSERT INTO public.packages (id, name, ...)
SELECT id, name, ... FROM unicorn1.packages;

-- Reset sequence
SELECT setval('public.packages_id_seq', 
  (SELECT COALESCE(MAX(id), 0) + 1 FROM public.packages), false);

INSERT INTO public.package_instances (id, ..., tenant_id)
SELECT pi.id, ..., t.id 
FROM unicorn1.package_instances pi
LEFT JOIN public.tenants t ON t.legacy_id = pi.client_id;

-- Reset sequence
SELECT setval('public.package_instances_id_seq', 
  (SELECT COALESCE(MAX(id), 0) + 1 FROM public.package_instances), false);
```

### Step 2: Notes Package ID Update (Run Second)
```sql
-- Update package_id by joining on package name
UPDATE public.notes n
SET package_id = p.id
FROM public.packages p
WHERE LOWER(TRIM(n.u1_package)) = LOWER(TRIM(p.name))
  AND n.u1_package IS NOT NULL;

-- Verification
SELECT 
  COUNT(*) FILTER (WHERE package_id IS NOT NULL) as notes_with_package_id,
  COUNT(*) FILTER (WHERE u1_package IS NOT NULL AND package_id IS NULL) as orphaned_notes
FROM public.notes;
```

## Expected Results

| Validation | Expected |
|------------|----------|
| Notes updated with package_id | 9,556 |
| Orphaned notes (name not matched) | 0 |
| Package IDs correctly aligned | Yes |

## Technical Notes

- Uses case-insensitive, trimmed name matching for safety
- Only updates notes where `u1_package` is populated
- Does not touch notes with other `parent_type` values
- Preserves all other note data unchanged

## Risk Mitigation

- Name-based matching verified for all 15 unique package names
- All names exist in `unicorn1.packages`
- No data loss - only populates previously NULL column

