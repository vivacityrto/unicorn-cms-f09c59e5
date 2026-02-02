

# Plan: Populate stage_sortorder from package_stages

## Overview

This update will populate the `stage_sortorder` column in `stage_instances` with the correct sort order from `package_stages`, ensuring phases display in their intended sequence.

## Current State

| Metric | Value |
|--------|-------|
| Total stage_instances | 5,990 |
| Records with NULL stage_sortorder | 5,990 (100%) |
| Matchable to package_stages | 5,982 |
| Orphan records (no match) | 8 |

## Solution

### 1. Database Migration

Create a migration that updates all matchable `stage_instances` with the `sort_order` from `package_stages`:

```sql
-- Populate stage_sortorder from package_stages
UPDATE stage_instances si
SET stage_sortorder = ps.sort_order
FROM package_instances pi
JOIN package_stages ps ON ps.package_id = pi.package_id AND ps.stage_id = si.stage_id
WHERE si.packageinstance_id = pi.id
  AND si.stage_sortorder IS NULL;
```

### 2. Frontend Update

Modify `PackageStagesManager.tsx` to order by `stage_sortorder` instead of `stage_id`:

**Current (line 108):**
```typescript
.order('stage_id')
```

**Updated:**
```typescript
.order('stage_sortorder')
```

## Files to Change

| File | Change |
|------|--------|
| New migration | Backfill `stage_sortorder` from `package_stages` |
| `src/components/client/PackageStagesManager.tsx` | Order by `stage_sortorder` instead of `stage_id` |

## Orphan Records Report

The following 8 records will remain with NULL `stage_sortorder` and require manual review:

| Package ID | Stage IDs |
|------------|-----------|
| 1034 | 1099, 1101, 1103, 1106, 1107, 1115, 1116 |

These stages are not defined in `package_stages` and need to be added manually before their sort order can be populated.

## Expected Outcome

- 5,982 phases will display in the correct order as defined in `package_stages`
- 8 orphan records will remain with NULL `stage_sortorder` for manual review
- Frontend will order by `stage_sortorder` (NULL values will appear at the end or beginning depending on PostgreSQL default behavior)

