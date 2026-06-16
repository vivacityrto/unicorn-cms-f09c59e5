## Goal

Make the "Tasks Released" indicator in `StageRow` (src/components/client/PackageStagesManager.tsx) an interactive staff control that can release or recall a stage's client tasks from the client portal, with confirmation, audit logging, optimistic refresh, and a timestamp tooltip.

## Codebase findings

- The file uses local `useState` + a `fetchStages()` refetch — **not** React Query. The user's reference to "invalidate React Query cache" doesn't apply here; the correct equivalent is calling `fetchStages()` (same pattern used by `toggleRecurring` at lines 298–326 and `updateStageStatus` at lines 442–512). I will follow the file's actual pattern.
- The existing `is_recurring` toggle uses: badge `onClick` → `onRecurringClick` prop → parent opens `AlertDialog` controlled by `recurringConfirm` state → on confirm calls `toggleRecurring` which `UPDATE`s `stage_instances`, writes a `client_audit_log` row, toasts, then `fetchStages()`. I will reuse this exact shape.
- `StageInstance` interface (lines 53–68) does not yet include `released_client_tasks_date`; the SELECT at line 382 also omits it. Both need to be added so the tooltip can render the timestamp.
- `stage_instances` already has columns `released_client_tasks boolean` and `released_client_tasks_date timestamptz`. No migration needed. RLS on `stage_instances` already governs who can update; the existing recurring toggle uses the same table with the same client, confirming staff have UPDATE rights — no policy change required.
- Tooltip primitives: shadcn `@/components/ui/tooltip` is used elsewhere in the project; I'll import `Tooltip`, `TooltipContent`, `TooltipTrigger`, `TooltipProvider`.

## Changes (single file: `src/components/client/PackageStagesManager.tsx`)

1. **Interface + fetch**
   - Add `released_client_tasks_date: string | null` to `StageInstance`.
   - Add `released_client_tasks_date` to the `.select(...)` at line 382.
   - Map it in the transform at lines 410–431 (`released_client_tasks_date: row.released_client_tasks_date || null`).

2. **StageRow props**
   - Add `onReleaseClick: (stage: StageInstance) => void` to `StageRowProps`, mirroring `onRecurringClick`.

3. **Badge replacement (line 139)**
   - When `released_client_tasks === false`:
     - Render a clickable outlined `Badge` (small, neutral) labelled "Release tasks" with a small icon (e.g. `Send` or `Eye` from lucide). `onClick` stops propagation and calls `onReleaseClick(stage)`.
   - When `released_client_tasks === true`:
     - Render a success-styled `Badge` ("text-emerald-700 border-emerald-500/40 bg-emerald-500/10" — semantic-friendly Tailwind, consistent with existing inline color usage at lines 119–120) labelled "Tasks Released", wrapped in a `Tooltip` whose content shows `Released {format(date, 'd MMM yyyy HH:mm')}` when `released_client_tasks_date` is present.
     - Next to it, render a small subtle icon-button (ghost variant, `h-6 w-6`) with an `Undo2` icon, `aria-label="Recall tasks"`, that calls `onReleaseClick(stage)` and stops propagation.

4. **Parent state + handler**
   - Add `const [releaseConfirm, setReleaseConfirm] = useState<StageInstance | null>(null);` next to `recurringConfirm`.
   - Add `toggleReleaseClientTasks(stage)` mirroring `toggleRecurring`:
     - `newValue = !stage.released_client_tasks`
     - `update = newValue ? { released_client_tasks: true, released_client_tasks_date: new Date().toISOString() } : { released_client_tasks: false, released_client_tasks_date: null }`
     - `await supabase.from('stage_instances').update(update).eq('id', stage.id)` — throw on error (the existing `toggleRecurring` silently swallows errors; I'll fix this small bug *only* for the new function by checking `error` and throwing, so a failed UPDATE doesn't show a success toast).
     - Insert `client_audit_log` row with `action: 'stage_client_tasks_released'` or `'stage_client_tasks_recalled'`, `entity_type: 'stage_instances'`, `entity_id: stage.id.toString()`, `before_data`/`after_data` for both `released_client_tasks` and `released_client_tasks_date`, `details: { stage_name, package_id }`.
     - Toast + `fetchStages()`; `setReleaseConfirm(null)` in `finally`.
   - Pass `onReleaseClick={(s) => setReleaseConfirm(s)}` in `renderStageRow`.

5. **Confirmation dialog**
   - Add a second `AlertDialog` next to the existing recurring one, gated on `releaseConfirm`:
     - When `releaseConfirm.released_client_tasks === false` (i.e. about to release):
       - Title: "Release tasks to client portal?"
       - Description: "Release all tasks for **{stage_name}** to the client portal? They will become visible to client users immediately."
       - Action button label: "Release"
     - When already released (recall):
       - Title: "Recall tasks from client portal?"
       - Description: "Recall tasks for **{stage_name}** from the client portal? Clients will no longer see these tasks."
       - Action button label: "Recall", `className="bg-destructive text-destructive-foreground hover:bg-destructive/90"`
     - Confirm → `toggleReleaseClientTasks(releaseConfirm)`.

6. **Imports**
   - Add `Send`, `Undo2` to the lucide imports.
   - Add `Tooltip, TooltipContent, TooltipProvider, TooltipTrigger` from `@/components/ui/tooltip`.

## Deep-dive checks

- **Backward compatibility**: Column already exists and nullable; flipping `released_client_tasks_date` back to `null` on recall matches the spec and won't break any read paths (verified via grep usage scope: only this component and the client portal read these fields; portal logic gates on the boolean, not the timestamp).
- **RLS**: No new policy required. UPDATE on `stage_instances` already works for staff (proven by the in-file `is_recurring` and `status` updates). Tenant scoping is enforced by existing policies on `stage_instances` keyed off `packageinstance_id → package_instances.tenant_id`.
- **FK constraints**: None affected. No row inserted/deleted on `stage_instances`; only two existing columns updated. `client_audit_log` insert mirrors existing inserts in this file.
- **Audit completeness**: Both release and recall are logged with before/after for both columns plus actor (`profile?.user_uuid`) and tenant.
- **Concurrency**: Optimistic UI is via `fetchStages()` refetch, same as the recurring toggle. No race introduced.
- **Role gating**: This component is rendered inside staff-only client management views (same scope as the `is_recurring` toggle). No new role check needed; if a non-staff user ever sees it, the existing RLS UPDATE policy will reject and the toast will surface the error (after the small error-handling fix in step 4).
- **Tooltip when date missing**: Legacy rows may have `released_client_tasks = true` but `released_client_tasks_date = null`. Tooltip falls back to "Released (date unknown)" so the UI is safe.
- **No changes to**: client-portal task visibility logic, hooks, types.ts (auto-generated), migrations, or any other file.

## Risk assessment

- **Low risk**. Single-file, UI-driven change against pre-existing columns; mirrors a known-good interaction pattern already in the same component.
- **Mitigated risks**:
  - Wrong column name → verified via existing SELECT on the same table.
  - Silent UPDATE failure → new function checks `error` and throws (existing `toggleRecurring` does not; I'm only tightening the new code path, not touching the old one).
  - Accidental recall by client of test → guarded by destructive-styled confirmation dialog and ghost icon button (not prominent), per spec.
- **Out of scope / not changed**: React Query (not used here), the existing recurring-toggle error swallowing, client portal rendering of tasks.

## Summary of changes

- `src/components/client/PackageStagesManager.tsx` only:
  - Extend `StageInstance` + fetch with `released_client_tasks_date`.
  - Replace read-only badge with an interactive Release badge / success badge + Recall icon button (tooltip shows release timestamp).
  - Add `releaseConfirm` state, `toggleReleaseClientTasks` handler with audit log, and a context-aware `AlertDialog` for release vs recall.
  - Wire prop through `StageRow`.

## Benefits

- Staff can release or recall client tasks per stage without DB access.
- Full audit trail of both actions, with actor and tenant.
- Visual distinction (green success vs neutral) makes released stages obvious; timestamp tooltip aids investigations.
- Consistent UX with the existing recurring toggle so no new mental model.
