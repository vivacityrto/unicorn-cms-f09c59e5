

## Fix Delete Button — Column Names + Missing Cascade Tables

### Problem
The delete function fails because:
1. **Wrong column names**: Lines 196-198 use `stage_instance_id` but the actual DB column is `stageinstance_id` (no underscore)
2. **Missing cascade tables**: `package_instance_state_log` and `compliance_score_snapshots` reference `package_instances` without DB-level CASCADE

### Changes

**File: `src/components/client/PackageDataManager.tsx`** — `handleDelete` function (lines 185-222)

Replace the cascade sequence with:

1. Fetch stages via `packageinstance_id` (unchanged)
2. Fix column name: `client_task_instances.stageinstance_id`
3. Fix column name: `email_instances.stageinstance_id`
4. Fix column name: `document_instances.stageinstance_id`
5. Delete `stage_instances` (unchanged)
6. Delete `time_entries` (unchanged)
7. Delete `phase_instances` (unchanged)
8. **Add**: Delete `package_instance_state_log` WHERE `package_instance_id = row.id`
9. **Add**: Delete `compliance_score_snapshots` WHERE `package_instance_id = row.id`
10. Delete `package_instances` (unchanged)

No migration needed — code-only fix. No risk to other packages (confirmed: stage IDs are unique per package).

