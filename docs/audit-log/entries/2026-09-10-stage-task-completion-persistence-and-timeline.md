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
completions. `supabase/migrations/20260910013418_task_status_changed_timeline_event.sql`
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

## Follow-up: transcription drift Carl caught live (2026-09-10, same day)

Carl spotted real production Timeline entries reading
`"... completed (Setup Client -- na)"` — a literal double-hyphen, not the
em dash (`—`) the committed migration actually contains. Root cause: when
retyping the SQL into the `apply_migration` tool call, the em dash was
retyped as `--` — the same class of risk AGENTS.md already documents for
manual Edge Function deploys ("manual deploys risk transcription errors
from retyping large files... verify after"), here for a migration body
instead. Confirmed by pulling the live function source
(`select prosrc from pg_proc where proname = '...'`) and diffing against
the committed file.

Fixed via `supabase/migrations/20260910014444_fix_task_timeline_title_dash_transcription.sql`
(`CREATE OR REPLACE`, no logic change beyond the character) plus a one-time
backfill (`UPDATE ... SET title = replace(title, ' -- ', ' — ') WHERE
event_type IN ('task_completed_team','task_status_changed') AND title LIKE
'%--%'`) correcting the 15 rows already written since this morning's
migrations, so existing Timeline entries read consistently with new ones.
Verified 0 rows remain with the wrong dash afterward.

Take-away for future MCP-applied migrations containing non-ASCII
punctuation (em dashes, smart quotes, etc.): diff the live `pg_get_functiondef`
against the git file's exact bytes before considering the change done, not
just its functional behaviour — the same discipline already required for
manual Edge Function deploys applies here.

## Follow-up: raw status values in titles (2026-09-10, same day)

Carl then flagged the same screenshot's status text itself:
`"(RTO Documentation - 2025 — in_progress)"` — the trigger was embedding
`stage_instances.status`/`staff_task_instances.status`'s raw
`dd_status.value` (snake_case) rather than a human label. Fixed via
`supabase/migrations/20260910014915_task_timeline_status_labels.sql`:
looks up `dd_status.description` (the same label source
`src/hooks/useTaskStatusOptions.ts` already uses elsewhere in the app —
"Not Started", "In Progress", "Completed", "N/A", "Core Complete",
"Monitor") for the stage's current status and, for `task_status_changed`,
both the old and new task status in the "X -> Y" portion; falls back to a
Title-Case rendering of the raw value (`initcap(replace(..., '_', ' '))`)
if a status is ever missing from `dd_status`, so a future new status
degrades gracefully instead of showing blank text. `metadata`'s raw
`old_status`/`new_status`/`stage_status` fields are unchanged (still the
snake_case DB values — only the human-facing `title` string changed).

Also backfilled the titles of all 16 rows written since this morning's
migrations by re-deriving from each row's `metadata` (`stage_id`,
`old_status`/`new_status`/`stage_status`, `task_name` — all already
present) rather than parsing the old title text, since the metadata was
never affected by either the dash or the label issue.

Live-verified in a rolled-back transaction first (a real Not
Started → In Progress transition produced `"...: Not Started ->
In Progress (Mock Audit — Not Started)"`), then applied for real and
confirmed all 16 existing rows read with proper labels afterward
(`"... (Setup Client — N/A)"`, `"... (RTO Documentation - 2025 — In
Progress)"`), and re-diffed the live function source against the
committed file to rule out a repeat of the dash-transcription mistake
from the prior follow-up.

## Follow-up: SHCS Academy Pty Ltd (tenant 7408) M-SAC investigation (2026-09-10)

Carl asked to check a specific client report: a CSC said they'd changed a
stage task's status on M-SAC before, but it looked like it reset. Traced
tenant 7408's active M-SAC package instance (15147) end to end:

- **Strong candidate for the reported symptom:** stage instance 25051
  ("Compliance Health Check 2025", a recurring stage added mid-package on
  2026-07-11) has 6 staff tasks that are *still* sitting at `not_started`
  today with **zero** `client_audit_log` or `client_timeline_events` history
  of any kind since creation — two months with no recorded activity at all.
  That's the exact signature of the silent-failure bug fixed earlier this
  session: a pre-fix attempt would show a success toast but never write,
  and (unlike a genuine SQL error) leave no trace anywhere. Not proven this
  is the exact incident the CSC meant, but it's the one place in this
  client's data that matches the report precisely.
- **Confirmed the fix works going forward:** the same session, 4 tasks on
  this package's "Setup Client" stage (24637) were completed live by a real
  CSC (Ezel Olores) *after* today's fix shipped, and all 4 persisted
  correctly with matching `client_audit_log` entries and
  `client_timeline_events` rows — no reversion.
- **Ruled out as the cause:** the *prior* M-SAC cycle (package instance
  15072, closed on renewal 2025-11-18) has its own real completed-task
  history from 2025 fully intact on its own `stage_instances` — nothing was
  lost, it's a separate closed-out package instance from the current one.
  If the CSC was comparing against last year's cycle, that reads as "reset"
  but is just how annual renewals work (a fresh package_instance per cycle,
  not a continuation of the same rows).
- **Noted but not the cause:** a system account ("Bulk Generate Automation")
  called `repair_package_instance_stages` on this and several other SHCS
  packages 9 times across two short bursts (2026-08-20, 2026-08-23) — but
  that RPC only inserts rows guarded by `NOT EXISTS`, never touches an
  existing task's status (confirmed via `pg_get_functiondef`). The firing
  pattern itself (repeatedly, ~60-70s apart) is unusual and worth a
  separate look, but not flagged as a persistence-bug cause here.

No code change from this investigation alone — recommended Carl have the
CSC retry a status change on "Compliance Health Check 2025" now that the
fix is live, to close the loop with a real positive confirmation.

## Follow-up: same label issue in `stage_status_changed` (2026-09-10)

Carl spotted the identical raw-snake_case problem in a *different* trigger:
`stage_status_changed` titles read e.g. `"Vivacity Academy Enrolment (v2):
not_started -> completed"`. This is the older, separate
`fn_stage_instance_timeline_trigger()` (on `stage_instances`, from
2026-08-04) — not the staff-task trigger fixed above, but the same defect
class. Fixed identically via
`supabase/migrations/20260910034510_stage_status_changed_timeline_labels.sql`:
`dd_status.description` lookup for both `OLD.status`/`NEW.status` with the
same Title-Case fallback, no other logic change. Backfilled all 30 existing
`stage_status_changed` rows by re-deriving from each row's own
`old_status`/`new_status` metadata (the stage-name portion of the title was
preserved via `split_part(title, ':', 1)`, since that part was never
wrong). Verified 0 rows remain matching the raw
`": <lowercase> -> <lowercase>"` pattern, and re-diffed the live function
source against the committed file — exact match, no repeat of the earlier
transcription mistake.

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
