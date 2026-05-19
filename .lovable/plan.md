## Fix Actions column for Action and Ops rows

**File:** `src/pages/TasksManagement.tsx` (Actions `<TableCell>` at lines 1264–1305)

### Current behavior
The cell renders Edit + Delete buttons only when `!task.source || task.source === 'task'`. For `action` and `ops` rows it falls through to the `—` placeholder, so users have no way to complete or delete them.

### Change
Restructure the cell to render two branches inside a single flex container:

1. **`task` source (or unset)** — unchanged Edit (Pencil) + Delete (Trash2) buttons with their existing onClick handlers.
2. **`action` or `ops` source** — a green CheckCircle2 button (hidden when `task.completed`) calling `handleActionChange(task.id, "completed")`, plus a red Trash2 button calling `handleActionChange(task.id, "delete")`.

The outer `<TableCell>` keeps its current className and `onClick={e => e.stopPropagation()}`. The `—` placeholder fallback is removed since both source branches now render something.

### Notes
- `CheckCircle2`, `Pencil`, `Trash2` already imported.
- `handleActionChange`, `updateTaskStatus`, `deleteTask` are untouched — they already route by id prefix.
- Edit is intentionally not shown for action/ops rows (the edit dialog only writes `tasks_tenants`).

### Verification
- As Carl, the 'test' ops row shows green check + red trash.
- Clicking check marks complete → persists to `ops_work_items.status='done'`.
- Clicking trash deletes the `ops_work_items` row.
- Task rows still show Edit + Delete.
- No console / TS errors.
