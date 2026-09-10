# Audit: 2026-09-10 — stage task completion persistence + task status timeline events

**Trigger:** ad-hoc — Carl reported consultants completing a stage task and it
not persisting, specifically on newer stages.
**Scope:** `src/hooks/useStaffTaskInstances.ts` (the live client-detail stage
task completion path) and the `client_timeline_events` trigger surface for
`staff_task_instances`. Did not touch the package-builder template/override
editors (`StageDetailPanel.tsx`, `PackageStagesManager.tsx`) — no matching
reports there and out of scope for this pass.

## Findings

- Investigated several concrete hypotheses for the reported non-persistence
  first (duplicate `staff_task_instances` rows from re-seeding, a mismatch
  between `client_audit_log`'s claimed status and the row's actual
  `status_id`, the `dd_status`/`trg_staff_task_status_normalize` validation
  trigger rejecting a status pair) — none reproduced against production data.
- Found a real, confirmed defect instead: every mutation in
  `useStaffTaskInstances.ts` (`updateTaskStatus`, the two `stage_instances`
  auto-promote/auto-complete writes inside it, `updateTaskAssignee`,
  `updateTaskCore`) called `.update(...).eq('id', taskId)` with no
  `.select()`. Supabase-js reports success with no error when RLS silently
  filters an update to zero matching rows (e.g. the acting user's
  `is_vivacity_internal`/tenant access lapsed) — the "Task Updated" toast
  fires, the row is never written, and a refresh shows the task reverted.
  This matches the reported symptom exactly; could not confirm it as the
  specific historical incident's cause (no corroborating trace found in
  `client_audit_log` vs. current `staff_task_instances.status_id`), but it's
  a real, reproducible gap regardless.
- Separately: `task_completed_team` has been a valid
  `client_timeline_events.event_type` since 2026-08-04
  (`20260804050000_stage_instance_status_timeline_event.sql`) and is already
  referenced by the Timeline UI's "tasks" filter
  (`src/hooks/useClientManagementData.tsx` `EVENT_TYPE_FILTERS`), but nothing
  ever wrote one — `staff_task_instances` had no timeline trigger at all
  (confirmed via `pg_trigger`). Consultants completing a stage task produced
  no Timeline entry, only the much-less-visible `client_audit_log` row.

## Code changes (this entry accompanies)

- `src/hooks/useStaffTaskInstances.ts`: added `.select('id')` + an explicit
  zero-rows-updated check (throws / logs) to all five writes in the file, so
  an RLS-filtered update now surfaces as a real error instead of a false
  "Task Updated" success.
- `supabase/migrations/20260910012533_task_completed_team_timeline_event.sql`
  (applied via Supabase MCP `apply_migration`): new
  `fn_staff_task_instance_completed_timeline_trigger()` +
  `trg_staff_task_instance_completed_timeline` `AFTER UPDATE OF status,
  status_id ON staff_task_instances`. Fires only on a fresh transition into
  Completed(2)/Core Complete(4) (not on every status change, not when
  reverting away from complete, not when editing between the two completed
  states). Mirrors the existing `fn_stage_instance_timeline_trigger()`
  pattern exactly: `SECURITY DEFINER`, `search_path = ''`, direct `EXECUTE`
  revoked from `anon`/`authenticated`/`PUBLIC`, `visibility = 'internal'`
  (staff task detail isn't client-facing anywhere today, same rationale as
  `stage_status_changed`), `source = 'system'`. The event's `metadata` and
  title embed the stage's *current* `stage_instances.status` at the moment
  of task completion, so the task-completion entry is legible on its own
  without cross-referencing the stage's separate `stage_status_changed`
  event (which still fires independently, via the existing
  `stage_instances` trigger, whenever the auto-complete-stage branch in the
  same hook actually writes a new stage status).
  - Column list deliberately includes both `status` and `status_id`: one
    real caller, `complete_audit_stage_tasks()`, only `SET`s `status` and
    relies on `trg_staff_task_status_normalize` to derive `status_id` — a
    trigger's `UPDATE OF` column list is evaluated against the original
    statement's target list, not the row after a `BEFORE` trigger modifies
    it, so `status_id`-only would have silently missed that path.

## Follow-up same day: broadened to all status transitions

Carl asked for every status change to appear on the Timeline, not only
completions. `supabase/migrations/20260910070000_task_status_changed_timeline_event.sql`
(applied via Supabase MCP `apply_migration`) adds `task_status_changed` to
the `client_timeline_events.event_type` CHECK constraint and to
`TIMELINE_EVENT_TYPES` (`src/types/timeline.ts`), and `CREATE OR REPLACE`s
the same trigger function (name/signature unchanged) so that:
- A fresh transition into Completed(2)/Core Complete(4) still emits
  `task_completed_team` (unchanged wording).
- Every other real transition — Not Started → In Progress, reverting away
  from Completed, editing between the two completed states, etc. — now
  emits `task_status_changed`, titled `<task>: <old> -> <new> (<stage> —
  <stage status>)`, mirroring `fn_stage_instance_timeline_trigger()`'s own
  `%s -> %s` convention. A guard (`OLD IS NOT DISTINCT FROM NEW` on both
  columns) skips a no-op re-save of the same status, since `UPDATE OF`
  fires whenever a listed column is in the SET clause regardless of whether
  the value actually changed.
- Added `task_status_changed` to the Timeline UI: `EVENT_TYPE_FILTERS.tasks`
  (`src/hooks/useClientManagementData.tsx`) and the exhaustive
  `EVENT_ICON_MAP`/`EVENT_COLOR_MAP` in `TimelineEventCard.tsx` (`ListChecks`
  icon, blue — matching `stage_status_changed`'s treatment, to visually pair
  "a status changed" against the purple/green completion-flavoured types).
  `getModuleChip`'s existing `eventType.startsWith('task')` already covers
  it without a change.

## Live verification

Rolled-back transactions against production (`BEGIN; ... ROLLBACK;`, no
residual data) for every branch of the final logic:
1. `UPDATE staff_task_instances SET status_id = 2, status = 'completed'`
   (the direct `useStaffTaskInstances.ts` path) → correct
   `task_completed_team` row with task name, stage name, and `stage_status`
   in both `title` and `metadata`.
2. `UPDATE staff_task_instances SET status = 'completed'` only (the
   `complete_audit_stage_tasks()` shape) → same, confirming the broadened
   `status, status_id` column list was necessary.
3. Not Started → In Progress → correct `task_status_changed` row
   (`... not_started -> in_progress ...`).
4. Completed → Monitor (a revert away from complete) on the same row, in one
   transaction → produced *two* correctly-ordered events:
   `task_completed_team` first, then `task_status_changed`
   (`completed -> monitor`) — confirms the two event types don't
   double-fire or collide on the same transition.

Confirmed the trigger is registered correctly via `pg_trigger` alongside the
two pre-existing triggers on the table
(`trg_staff_task_event_conducted`, `trg_staff_task_status_normalize`).

Not separately live-tested: the `.select()`-based persistence fix itself
(would require impersonating a user who genuinely fails the RLS check, which
none of the current internal accounts do — confirmed via `is_vivacity_team_safe`
covering all internal users checked). The fix is a defensive-coding
correction of a real Supabase-js footgun, not contingent on reproducing the
specific failure.

## Open questions parked

- The specific historical incident (which consultant, which client, which
  stage) was never pinned down — Carl didn't have exact repro details on
  hand this session. If it recurs, capture the tenant/stage/task and re-check
  `client_audit_log` vs. actual `staff_task_instances` state for that task
  specifically; the fix above should now make each individual failure loud
  (a toast error) rather than silent, which will make the next occurrence
  much faster to trace.
- Same `.update()`-without-`.select()` pattern likely exists elsewhere in the
  codebase (e.g. `PackageStagesManager.tsx`'s stage status writes). Not
  swept in this pass — scoped to the file actually implicated by the report.
