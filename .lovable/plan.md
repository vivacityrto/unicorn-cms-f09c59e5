## KPI Tasks management UI

Add a new `KpiTasksSection` rendered inside `KpiDashboard.tsx` for every user (any `kpi_role`). It backs onto `public.kpi_tasks` (column name is `assignee_uuid`, not `owner_user_id` — code will use the real column).

### 1. Lookup seed migration

Spec uses statuses `pending`, `done_on_time`, `rectified`, `delayed`. Add them to `public.dd_kpi_task_status` (without removing existing rows) so the lookup stays the source of truth:

```sql
INSERT INTO public.dd_kpi_task_status (value, label, sort_order, is_active) VALUES
  ('pending',      'Pending',      10, true),
  ('done_on_time', 'Done on time', 20, true),
  ('rectified',    'Rectified',    30, true),
  ('delayed',      'Delayed',      40, true)
ON CONFLICT (value) DO NOTHING;
```

No table/RLS/grant changes — `kpi_tasks` already exists with policies.

### 2. New file `src/components/kpi/KpiTasksSection.tsx`

Props: none (operates on the current user).

State / data:
- `useAuth()` → `user.id`, `profile`.
- `assignedToMe`: `kpi_tasks` rows where `assignee_uuid = user.id`, plus assigner display name fetched in a follow-up `.in('user_uuid', [...])` against `users` (`user_uuid, first_name, last_name, kpi_role`).
- `assignedByMe`: `kpi_tasks` rows where `assigned_by = user.id`, plus assignee display via the same lookup.
- Both lists fetched in a single `useEffect`/refresh cycle and exposed as `refresh()`.
- `assignableUsers`: from `users` with `.not('kpi_role','is',null).neq('kpi_pod','qa').order('first_name')` (matches existing project convention).

Helpers:
- `dueTone(due_at)` → `text-foreground` (>2d), `text-amber-600` (≤2d), `text-rose-600` (overdue).
- `statusBadge(status)` → coloured `Badge` (emerald `Done on time`, amber `Rectified`, rose `Delayed`, slate `Pending`).
- `fullName(u)` → `"First Last"` fallback to email/uuid.

#### PART 1 — "Tasks assigned to me" card

Ordering done in JS:
1. Pending overdue (`status === 'pending'` && `due_at < now`), by `due_at asc`.
2. Other pending, by `due_at asc nulls last`.
3. Completed (`status !== 'pending'`), collapsed under a `<Collapsible>` toggle showing count, expanded on click.

Pending row layout (flex):
- Title (font-medium) + small "Assigned by {full name}" muted line.
- Due-date pill using `dueTone`, formatted `dd/MM/yyyy`.
- Three buttons (small): `Done on time` (default variant), `Rectified` (secondary), `Delayed` (destructive-outline).

`markStatus(id, newStatus)`:
```ts
await supabase.from('kpi_tasks')
  .update({ status: newStatus, completed_at: new Date().toISOString() })
  .eq('id', id).eq('assignee_uuid', user.id);
```
On success: optimistic patch + `refresh()`. Once completed, the row re-renders in the Completed group (read-only with status badge).

Completed row layout: title, "Assigned by …", status badge, completed date.

#### PART 2 — "Tasks I've assigned" card

Read-only list grouped same way (overdue pending first, pending, then completed collapsible). Row: assignee avatar (initials) + name, title, due-date with `dueTone`, status badge. No action buttons.

#### PART 3 — "+ Assign a task" sheet

Card header right-aligned button `+ Assign a task` opens a right-side `Sheet`.

Form (react-hook-form not required — local `useState`):
- `title` (Input, required).
- `assigneeUuid` (Radix `Select`, required) — options from `assignableUsers`, each item shows `First Last` + small role badge derived from `kpi_role` value (e.g. `CSC consultant`, `CST assistant`, `Developer`, `Reviewer`).
- `dueAt` (shadcn Popover + Calendar date picker per shadcn-datepicker guidance, `pointer-events-auto` on the Calendar; stores midnight UTC ISO).
- `description` (Textarea, optional).

Submit:
```ts
await supabase.from('kpi_tasks').insert({
  assignee_uuid: assigneeUuid,
  assigned_by: user.id,
  title,
  description: description || null,
  status: 'pending',
  due_at: dueAtIso,
});
```
On success: toast, close sheet, reset form, call `refresh()` so both lists update.

Validation: disable submit until `title`, `assigneeUuid`, `dueAt` all set. Surface Supabase errors via `sonner` toast.

### 3. Wire into `KpiDashboard.tsx`

- Import `KpiTasksSection`.
- Inside the existing `<div className="space-y-6">`, render `<KpiTasksSection />` once, gated by `isOwnDashboard && profile?.kpi_role` (any value) — placed below `KpiEmailLogSection`.
- No other dashboard changes.

### Notes

- Uses real column `assignee_uuid` (spec called it `owner_user_id`).
- No FK/grant/RLS changes; existing `kpi_tasks` policies already permit owners/assigners to read+update their rows.
- `dd_kpi_task_status` is extended (not replaced) so the rest of the platform that may reference legacy values (`completed`, `in_progress`, `overdue`, etc.) keeps working.
