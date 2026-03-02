

## Add `is_core` Flag to Staff Task Instances with "Core Complete" Auto-Flagging

### Concept

Instead of pre-defining which tasks are core at the template level, the `is_core` flag lives on **both** `staff_tasks` (template default) and `staff_task_instances` (runtime override). When a stage is set to **"Core Complete" (status 4)**, all **incomplete** staff task instances in that stage are automatically marked `is_core = false`. This lets the workflow itself define what's core vs non-core.

### Database Changes

**Migration 1: Add `is_core` to `staff_tasks` (template)**

```sql
ALTER TABLE public.staff_tasks
  ADD COLUMN IF NOT EXISTS is_core boolean NOT NULL DEFAULT true;
```

All existing template tasks default to core (safe compliance default).

**Migration 2: Add `is_core` to `staff_task_instances`**

```sql
ALTER TABLE public.staff_task_instances
  ADD COLUMN IF NOT EXISTS is_core boolean NOT NULL DEFAULT true;
```

All existing instances default to core. New instances seeded by the `start_client_package` RPC will also default to `true`.

**Migration 3: Update `start_client_package` RPC** (if it currently seeds `staff_task_instances`)

The RPC inserts staff task instances from the `staff_tasks` template. It should copy the `is_core` value from `staff_tasks` into the new instance so that any template-level defaults carry forward.

### Code Changes

**1. `PackageStagesManager.tsx` -- Stage status update handler**

When `newStatus === 4` (Core Complete):
- After updating `stage_instances.status`, run a second query to set `is_core = false` on all `staff_task_instances` in that stage where `status_id != 2` (not completed).
- Log this bulk change to `client_audit_log`.

```text
// Pseudocode within handleStageStatusUpdate
if (newStatus === 4) {
  await supabase
    .from('staff_task_instances')
    .update({ is_core: false })
    .eq('stageinstance_id', stageInstanceId)
    .neq('status_id', 2);  // only incomplete tasks
}
```

**2. `useStaffTaskInstances.ts` -- Fetch and expose `is_core`**

- Add `is_core` to the select query on `staff_task_instances`
- Add `is_core` to the `StaffTaskInstance` interface
- Map it in the transform

**3. `StageStaffTasks.tsx` -- Display non-core indicator**

- Tasks where `is_core === false` get a subtle visual indicator (e.g., a muted "Non-core" badge or italic styling)
- Core tasks show no extra badge (they are the default)

### Workflow Summary

1. Package starts -- all staff task instances seeded with `is_core = true` (copied from template)
2. Team works through tasks, completing some
3. Stage is marked **"Core Complete"** (status 4)
4. System automatically flags all remaining incomplete tasks as `is_core = false`
5. UI updates to show these tasks as "Non-core"
6. All changes are audit-logged

### Files to Change

| File | Change |
|------|--------|
| Database migration | Add `is_core` column to `staff_tasks` and `staff_task_instances` |
| `start_client_package` RPC | Copy `is_core` from template to instance during seeding |
| `src/components/client/PackageStagesManager.tsx` | Add auto-flag logic when status set to 4 (Core Complete) |
| `src/hooks/useStaffTaskInstances.ts` | Fetch and expose `is_core` field |
| `src/components/client/StageStaffTasks.tsx` | Show non-core visual indicator |

### Edge Cases

- **Reversing Core Complete**: If a stage is changed back from status 4 to another status, the non-core flags remain as-is (they were set intentionally). Users can manually manage if needed.
- **Already completed tasks**: Only incomplete tasks get flagged. Completed tasks retain `is_core = true`.
- **Audit trail**: The bulk `is_core` update is logged so there is a record of when and why tasks were flagged non-core.

