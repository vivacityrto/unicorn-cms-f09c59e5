## Scope
File: `src/pages/TasksManagement.tsx` only. No DB/migration/other-file changes.

## Changes

### 1. `Task` interface
- Add `priority: string | null`.
- Add `assignee_user?: { user_uuid; first_name; last_name; avatar_url } | null`.

### 2. `fetchTasks()` (lines ~126–289)
- Add `package_id` to the `client_action_items` select list.
- After fetching `clientActions` + `opsActions`:
  - Collect unique `package_instance_id`s from `opsActions`.
  - `SELECT id, package_id FROM package_instances WHERE id IN (...)` → build `instanceToPackageId: Map<number, number>`.
  - Merge resolved `package_id`s AND each `clientActions.package_id` into the `packageIds` set used for `packagesMap`.
- Normalise `tasks_tenants` rows: add `priority: null`, `assignee_user: undefined`.
- Normalise `client_action_items` rows: set `package_id: a.package_id`, `package_name` via `packagesMap`, `priority: a.priority`, `assignee_user: a.assignee_user_id ? usersMap.get(...) : null`.
- Normalise `ops_work_items` rows: resolve `pkgId = instanceToPackageId.get(a.package_instance_id)`, set `package_id: pkgId`, `package_name` via `packagesMap`, `priority: a.priority`, `assignee_user: a.owner_user_uuid ? usersMap.get(...) : null`.

### 3. `updateTaskStatus(taskId, newStatus)` (line ~391)
Route by id prefix:
- `ca-…` → strip 3 chars, update `client_action_items` with `status` mapped (`not_started→open`, `in_progress→in_progress`, `completed→done`), and on completed set `completed_at`/`completed_by`, else null both.
- `ops-…` → strip 4 chars, update `ops_work_items` with mapped `status`.
- else → existing `tasks_tenants` path unchanged.
Keep the optimistic `setTasks` using the original prefixed `taskId` so row identity is preserved.

### 4. `deleteTask(taskId)` (line ~427)
Same prefix-routing: delete from `client_action_items` / `ops_work_items` / `tasks_tenants` respectively (strip prefix for the first two).

### 5. Table UI (lines ~1046–1062 and body rows)
- Insert a new `<TableHead>Priority</TableHead>` between Status and Due Date.
- In the row body, render priority `<Badge>` using the same colour map copied locally from `MyWork.tsx` lines 38–43 (`urgent/high/normal/low`); for `null` priority render `<span className="text-muted-foreground">—</span>`.
- Rename "Followers" header → "Assigned / Followers".
- In that cell, branch on `task.source`:
  - `'task'` → existing multi-avatar `follower_users` rendering.
  - else → single `assignee_user` avatar with `<div className="text-[10px] text-muted-foreground">Owner</div>` underneath.
- Add a matching empty `<TableCell>` for the Priority column in any skeleton/empty-state rows so column counts stay aligned.

## Out of scope
Create Task dialog, Edit Task dialog, row-click sheet, MyWork/EosTodos, RPCs, migrations.

## Verification
Per the user's checklist: status change + delete work on `ops-` rows; Package column populated for `action`/`ops` rows with resolvable packages; Priority column visible everywhere (Badge for action/ops, em-dash for task); Assigned/Followers shows owner + "Owner" sub-label for action/ops; TS build clean, no console errors.