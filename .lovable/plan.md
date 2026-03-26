

## Data Correction: Sync `is_recurring` to Stage Instances

### Summary
There are **1,073 `stage_instances`** where the parent `stages.is_recurring = true` but the instance has `is_recurring = false`. The `package_stages` table is already correct. This is a data-only update.

### What Will Change

**1 SQL data update** (using the insert/update tool, not a migration):

```sql
UPDATE stage_instances si
SET is_recurring = true
FROM stages s
WHERE si.stage_id = s.id
  AND s.is_recurring = true
  AND (si.is_recurring IS NULL OR si.is_recurring = false);
```

This updates all 1,073 affected rows in one statement.

### What Won't Change
- No schema changes
- No code changes (the UI already reads `is_recurring` from `stage_instances`)
- `package_stages` already has the correct values

