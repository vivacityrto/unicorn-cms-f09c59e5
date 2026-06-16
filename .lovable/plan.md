# Phase 3 — Unified Client Portal Tasks (UI only)

## Goal
Show legacy stage tasks (`client_task_instances`) AND action items (`client_action_items`) in one list on the portal Tasks page, with My/All tabs and inline status edits for action items.

No DB migrations. Phase 2 already shipped the RLS split, column guard, and grants.

---

## Files

1. `src/hooks/useClientAllTasks.ts` — extend to fetch action items + merge.
2. `src/pages/ClientTasksPage.tsx` — tabs, assignee column, inline Select, completed-filter update.

---

## 1. `useClientAllTasks.ts`

### New unified type
```ts
export interface UnifiedTask {
  uid: string;                  // `cti-<id>` or `cai-<uuid>` (avoid id collisions)
  source: 'stage_task' | 'action_item';
  taskName: string;
  packageName: string;
  stageName: string | null;
  dueDate: string | null;
  status: number | string;
  priority: number;             // normalised 1..4 for sort/display
  attachmentRequired: boolean;
  isOverdue: boolean;
  isDueSoon: boolean;
  isArchived: boolean;
  archivedAt: string | null;
  assigneeUserId: string | null;
  assigneeName: string | null;
  actionItemId: string | null;
  actionItemStatus: string | null;
}
```
Keep exporting `ClientAllTask` as an alias of `UnifiedTask` to avoid breaking other consumers (see Risk R3).

### Action items fetch (parallel with existing stage-task pipeline)
```ts
let q = supabase.from('client_action_items')
  .select('id,title,due_date,status,priority,assignee_user_id,package_id,stage_id,source,completed_at')
  .eq('tenant_id', activeTenantId)
  .eq('item_type', 'client');
if (!includeArchived) q = q.not('status', 'in', '(done,cancelled)');
```
- No `is_archived` column on `client_action_items` — when `includeArchived` is true, fetch all statuses. When false, exclude `done` and `cancelled` (mirrors "hide completed" intent of archived toggle on legacy side).
- `isArchived` is always `false` for action items; `archivedAt` always `null`.

### Assignee name resolution
- Collect distinct `assignee_user_id` UUIDs.
- Single batch: `from('users').select('user_uuid,first_name,last_name,full_name,email').in('user_uuid', ids)`.
- Display: `full_name || trim(first+' '+last) || email || null`.
- Map into rows. If lookup returns nothing (RLS — see R1), `assigneeName = null` and UI shows `—`.

### Package name resolution
- Add any `package_id`s from action items to the existing `packageIds` set BEFORE the parallel fetch so we reuse one `packages` query.
- `package_id` null → `packageName = '—'`.

### Priority normalisation
```ts
const map = { urgent:1, high:2, medium:3, low:4 } as const;
priority = map[raw?.toLowerCase()] ?? 3;
```
Keep `status` typed as `number|string` — legacy rows pass number through, action items pass the text string. Existing `getStatusLabel(number,…)` keeps working; new render branch handles text.

### Overdue / due-soon
- For action items, "completed" = `status === 'done' || status === 'cancelled'`.
- Apply existing overdue/dueSoon date math against that completion check.

### Merge & sort
- Concatenate both arrays before the existing sort. Existing comparator works unchanged (only reads `isOverdue/isDueSoon/dueDate`).

### Backward compatibility
- Existing legacy rows keep same shape; new fields default to safe values (`source:'stage_task'`, `assigneeUserId:null`, etc.). Anyone importing `ClientAllTask` still works because we alias the type.

---

## 2. `ClientTasksPage.tsx`

### Current user
```ts
const { profile } = useAuth();
const currentUserId = profile?.user_uuid ?? null;
```
(Already used throughout the portal — no need for `supabase.auth.getUser()`.)

### View tabs (above existing filter row)
- `All Tasks` (default) — unchanged dataset.
- `My Tasks` — `tasks.filter(t => t.source === 'action_item' && t.assigneeUserId === currentUserId)`.
- Legacy stage tasks intentionally excluded from My Tasks (they have no assignee).
- Persist tab in `useState`, no URL state for this phase.

### Filter logic update
Replace completed check:
```ts
const isCompleted = (t: UnifiedTask) =>
  (t.source === 'stage_task' && t.status === 2) ||
  (t.source === 'action_item' && t.actionItemStatus === 'done');
```
Use it in the filter and in the `completedCount`.

### Table changes
- New header `Assignee` between `Stage` and `Priority`, `hidden md:table-cell`.
- Source indicator: no badge when stage tasks render normally (they already show stage in the Stage column). For action items where `stageName` is null, render `—` in Stage column. No extra source badge for now (Phase 4 will add the stage badge when `stage_id` is set).
- Selection set must change from `Set<number>` to `Set<string>` and use `uid` everywhere (legacy ids and uuids collide otherwise). Bulk bar stays Admin-only and Phase-3-cosmetic.

### Inline status Select for action items
- Statuses: hardcoded list (matches Phase 2 RLS column-guard whitelist):
  `todo, in_progress, blocked, waiting_client, done, cancelled`.
- Render `<Select>` from `@/components/ui/select` in the Status cell only when `task.source === 'action_item'`. Legacy rows keep the read-only Badge.
- Optimistic update via React Query:
  ```ts
  const qc = useQueryClient();
  await supabase.from('client_action_items')
    .update({
      status: newStatus,
      completed_at: newStatus === 'done' ? new Date().toISOString() : null,
      completed_by: newStatus === 'done' ? currentUserId : null,
    })
    .eq('id', actionItemId);
  ```
  - On success: `qc.invalidateQueries({ queryKey: ['client-all-tasks'] })`.
  - On error: revert local cache snapshot, `toast.error(...)`.
- The Phase 2 column-guard trigger silently allows these fields; any other write is rejected — we never touch others.

### Visual untouched
- Show-archived toggle, overdue/due-soon counters, sticky empty state, mobile compact line — all preserved.

---

## Deep-dive findings (gaps / risks)

**R1 — Users-table RLS for assignee names (Medium).**
`users` table policies are granular; portal users may not be able to read sibling tenant users. If the batch lookup returns `[]`, `assigneeName` stays `null` and UI shows `—`. Acceptable degradation; flagged for Phase 4 if product wants names visible. Mitigation considered: a SECURITY DEFINER `get_tenant_user_display_names(tenant_id)` RPC — out of scope for Phase 3 (UI-only).

**R2 — Multi-tenant portal users vs RLS using `users.tenant_id` (Medium).**
`cai_portal_select/update` checks `u.tenant_id = client_action_items.tenant_id`, but `ClientTenantContext` lets a user switch among multiple tenants via `tenant_users`. If `profile.tenant_id ≠ activeTenantId`, action-item reads/writes will return 0 rows / be silently rejected. This is a pre-existing inconsistency from Phase 2 RLS, not introduced here. Recommend: track for Phase 4 as RLS hardening (switch to `tenant_users` membership check). UI will simply show no action items in that case — no crash.

**R3 — Type rename breaks imports.**
Other files import `ClientAllTask` (`useClientWorkboard.tsx`, `AttentionPanel.tsx`, etc.). We will **alias** `export type ClientAllTask = UnifiedTask` so all imports keep compiling. Numeric `id` field consumers (none found in those files — they iterate by other fields) are safe; `uid` is additive.

**R4 — Selection id collision.**
Legacy `id:number` and action-item `id:uuid` can coexist. Switching to `uid:string` everywhere in `selected` Set prevents collisions and silent bulk-action mismatches.

**R5 — Sort stability for mixed null due dates.**
Action items frequently have `due_date = null`. Current comparator already pushes nulls to the end. No change.

**R6 — Status text vs number rendering.**
`getStatusLabel(status, statuses)` expects a number. Branch in the row: if `source === 'action_item'`, render the Select with raw text label (humanised) instead of calling `getStatusLabel`. Avoids "Unknown" labels.

**R7 — `includeArchived` semantics for action items.**
No `is_archived` column. We map the toggle to `status IN (done, cancelled)` visibility. This is documented in the hook and surfaces consistently with the legacy "archived = hidden by default" UX.

**R8 — Realtime / staleness.**
After inline update we invalidate `['client-all-tasks']`. No realtime subscription added in this phase. Acceptable for portal users editing their own row.

**R9 — Audit trail.**
`client_action_items.updated_at` is updated by trigger; `completed_by` captures who closed it. No explicit `audit_events` insert needed — meets the project's "who/what/when" rule via existing column trail. Flagged if compliance wants stronger logs in Phase 4.

**R10 — FK / constraint impact.** None. Read-only joins + an UPDATE on whitelisted columns. Phase 2 trigger enforces the column guard, so even a buggy client-side mutation cannot widen the blast radius.

---

## Backward compatibility checklist
- Existing legacy task rendering: unchanged (same columns, same badge, same mobile layout).
- Show-archived toggle: unchanged for legacy; documented new meaning for action items.
- Bulk select: works after `id → uid` migration; no bulk action behaviour ships in this phase.
- Filters (overdue/due_soon/completed): unified completion check covers both sources.
- React Query key `['client-all-tasks', tenantId, includeArchived]` unchanged; payload shape expanded only with additive fields.
- No edits to RLS, FKs, triggers, types.ts, or shared components beyond the two files.

## Summary of changes
- Hook now returns a unified, additively-typed list combining stage tasks + action items with assignee names.
- Page gains My/All tabs, an Assignee column, and an inline action-item status editor with optimistic updates and cache invalidation.
- Selection model migrates from numeric id to string `uid` to prevent collisions.
- All legacy behaviour preserved.

## Benefits
- One inbox for portal users — no more split between stages and ad-hoc client to-dos.
- Action item triage (assignee + status edit) without leaving the Tasks page.
- Foundation ready for Phase 4 (stage-linked action items, badges, audit hooks).

## Risk assessment
Overall risk: **Low–Medium**. Low for breakage (additive types, RLS untouched, column-guard trigger contains writes). Medium for UX degradations tied to existing RLS posture (R1, R2) — surfaced as `—` / empty rows rather than errors. No production data path is altered.
