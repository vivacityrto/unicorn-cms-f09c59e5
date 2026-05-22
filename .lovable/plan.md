## Fix three bugs in `src/hooks/useClientAllTasks.ts`

Frontend-only changes, scoped to a single file. No DB/migration work.

### Change 1 — Filter `package_instances` to active only (Step 1)

Add `.eq("is_active", true)` so historical/completed packages (e.g. M-AM, instance 15119) are excluded.

```ts
const { data: pkgInstances, error: pkgErr } = await supabase
  .from("package_instances")
  .select("id, package_id")
  .eq("tenant_id", activeTenantId)
  .eq("is_active", true);
```

### Change 2 — Filter `stage_instances` to released-to-client only (Step 2)

Select `released_client_tasks` and filter on it. Only released stages flow through to task fetching.

```ts
const { data: stageInstances, error: stgErr } = await supabase
  .from("stage_instances")
  .select("id, packageinstance_id, stage_id, released_client_tasks")
  .in("packageinstance_id", pkgInstanceIds)
  .eq("released_client_tasks", true);
```

### Change 3 — Add `.in()` filter on `client_tasks` fetch (Step 3)

The current `client_tasks` fetch has no filter and hits Supabase's 1000-row cap, so higher-ID metadata is missed and tasks fall back to `Task {id}`. Collect referenced `clienttask_id` values from the task instances and constrain the query:

```ts
const clientTaskIds = [
  ...new Set(
    (taskRes.data as any[]).map((t) => t.clienttask_id).filter(Boolean)
  ),
] as number[];

const clientTaskRes = await supabase
  .from("client_tasks")
  .select("id, name, priority, attachment_required")
  .in("id", clientTaskIds);
```

Because the existing code fetches `client_tasks` in parallel with the task-instances fetch (`Promise.all`), this change requires restructuring: fetch task instances first, then fetch `client_tasks` (with the `.in()` filter), `packages`, and `stages` in parallel afterwards. Packages and stages can stay parallel since they don't depend on `taskRes`.

### Verification

- Test RTO A → Tasks page: previously-blank "Task 52223" entries now show real names (CRICOS Timetable, International Student Prospectus, etc.)
- Tasks from unreleased stages no longer appear
- Tasks from inactive historical package M-AM (instance 15119) no longer appear
- Toggling a stage's `released_client_tasks` true/false adds/removes its tasks on refetch

### Out of scope

No other files touched. No DB changes. No changes to sorting, archived handling, or the return shape.
