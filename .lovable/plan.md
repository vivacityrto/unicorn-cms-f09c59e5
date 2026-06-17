# Client Tasks — Portal Editing + UI Cleanup

## 1. Migration — allow `priority` updates from the portal

Recreate `public.client_action_items_portal_column_guard()` via `CREATE OR REPLACE FUNCTION`, removing the `OR NEW.priority IS DISTINCT FROM OLD.priority` line from the blocked-columns check. All other attributes preserved verbatim:

- `RETURNS trigger`, `LANGUAGE plpgsql`, `SECURITY DEFINER`, `SET search_path = ''`
- `auth.uid()` lookup + `service_role` / `is_vivacity_team_safe` bypass unchanged
- Updated `RAISE EXCEPTION` message to reflect that `priority` is now editable: `'Portal users may only update status, completed_at, completed_by, assignee_user_id, priority on client_action_items'`
- Existing trigger binding and grants stay as-is (we are only replacing the function body), so no `REVOKE/GRANT` or `CREATE TRIGGER` statements need to be re-issued.

Backward compatibility: existing callers (Vivacity staff, service role) still bypass the guard. Portal users gain a new permitted column; nothing previously allowed is removed.

## 2. UI — `src/pages/ClientTasksPage.tsx`

All four changes are scoped to this single file.

### 2a. Remove Stage column
- Drop the `<th>Stage</th>` header.
- Drop the `<td>{task.stageName ?? "—"}</td>` cell in `TaskRow`.
- Keep the mobile fallback line that still appends `· {stageName}` under the task title (the column is removed from the desktop table only; the inline mobile string remains, matching how `packageName` is shown).

### 2b. Inline assignee picker
- Add a `useTenantPortalUsers(activeTenantId)` query co-located in this file (or inline `useQuery`) that fetches once per page load:
  ```ts
  supabase
    .from("users")
    .select("user_uuid, first_name, last_name, email")
    .eq("tenant_id", activeTenantId)
    .eq("is_vivacity_internal", false)
    .order("first_name", { ascending: true })
  ```
  Query key: `["client-tenant-portal-users", activeTenantId]`, `staleTime: 5 * 60_000`.
- Pass the resulting array down to each `TaskRow`.
- Replace the read-only Assignee cell with a compact `<Select>` (h-7, text-xs to match the existing status select):
  - Options: one `"__unassigned__"` item labelled "Unassigned", then each user rendered as `${first_name} ${last_name}`.trim() || email.
  - Value: current `task.assigneeUserId ?? "__unassigned__"`, with a local `assigneeOverrides` map (mirrors the existing `statusOverrides` pattern) for optimistic UI.
  - On change: optimistic set → `supabase.from("client_action_items").update({ assignee_user_id: newId }).eq("id", task.actionItemId)` → on error revert + `toast.error`, on success `toast.success("Assignee updated")` + `queryClient.invalidateQueries({ queryKey: ["client-all-tasks"] })` then clear the override.
- Only rendered when `task.source === "action_item"`. For legacy stage tasks, fall back to plain `{assigneeName ?? "—"}` (current behaviour).

### 2c. Inline priority picker
- Add a `PRIORITY_OPTIONS = [{value:'urgent',label:'Urgent',badge:<destructive>}, {value:'high',label:'High',badge:<destructive>}, {value:'medium',label:'Medium',badge:<amber>}, {value:'low',label:'Low',badge:<secondary>}]` table colocated with the existing `priorityLabel`.
- Add a `numericToPriorityString` reverse-map of the existing `PRIORITY_MAP` in `useClientAllTasks` (1→urgent, 2→high, 3→medium, 4→low) so the new picker's value comes from the already-normalised numeric `task.priority`.
- Replace the read-only badge cell with a `<Select>` whose `<SelectTrigger>` is styled like the existing colour-coded badge (no border, `bg-*/15`, coloured text, h-6 rounded-full). The trigger renders the current label so it still reads as a pill.
- Local `priorityOverrides` map mirrors `statusOverrides`: optimistic update → `supabase.from("client_action_items").update({ priority: newValue }).eq("id", task.actionItemId)` → on error revert + `toast.error`, on success `toast.success("Priority updated")` + invalidate `["client-all-tasks"]`.
- Only rendered when `task.source === "action_item"`. Legacy stage tasks keep the read-only badge.

### 2d. Remove the `Action` source pill
- Remove the `<Badge>Action</Badge>` next to the task title in `TaskRow`. The mobile fallback line and the rest of the row are untouched.

## Technical details

- Priority on `UnifiedTask` is normalised to `number` (1–4) in `useClientAllTasks` from text in the DB. We read the number for display, write back the lowercase string. The status-override pattern is reused 1:1 for `assigneeOverrides` and `priorityOverrides` to keep the refactor minimal and consistent.
- The portal column guard now permits `priority`. Combined RLS policy on `client_action_items` (assignee/owner/admin) already allows the UPDATE — no policy change required.
- No DB-level GRANT/RLS changes; no migration to add. Schema is unchanged.
- Audit: the existing `client_audit_log` triggers (if attached) keep recording the row diff; making `priority` a permitted column does not bypass any audit hook.
- Backward compatibility: stage tasks (non-action items) continue to render legacy read-only cells; nothing in the staff-side UI is affected.

## Risk assessment

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Portal user changes priority on a task they shouldn't see | Low | RLS policy `client_action_items` still restricts UPDATE to owner/assignee/admin; guard only blocks columns, not row access. |
| Optimistic UI desyncs on error | Low | Revert pattern already proven by status override; toast on error. |
| Assignee dropdown lists users from other tenants | Low | Query filters `tenant_id = activeTenantId` and `is_vivacity_internal = false`. |
| Removing Stage column hides info on small screens | None | Mobile fallback line still includes `stageName`. |
| Priority numeric mapping drift | Low | Use the same `PRIORITY_MAP` keys (urgent/high/medium/low) defined in `useClientAllTasks`; "normal" remains a read-only alias that maps to medium for display only. |
| Trigger re-creation drops `is_vivacity_team_safe` bypass | None | `CREATE OR REPLACE FUNCTION` preserves the trigger binding; bypass branch left untouched. |

## Summary of changes

- 1 migration: `CREATE OR REPLACE FUNCTION public.client_action_items_portal_column_guard()` with `priority` removed from blocked columns and the error message updated.
- 1 file edit: `src/pages/ClientTasksPage.tsx` — drop Stage column, drop Action pill, add inline assignee picker (with one tenant-scoped users query), add inline priority picker styled as a badge, both with optimistic update + revert + toast + query invalidation.

## Benefits

- Portal admins/assignees can triage priority and assignment without leaving the tasks list.
- Removes two redundant visual elements (Stage column shows `—` for all rows; Action pill is universally true in this view).
- Reuses the established optimistic-override pattern, keeping the page consistent and easy to reason about.
