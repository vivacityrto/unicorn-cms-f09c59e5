-- Retire the GitHub task sync (Carl's decision, 28 Oct 2026: reconcile manually).
--
-- Drops the two service-role-only functions that were the only code able to
-- change a milestone's status from a task event. Nothing calls them any more
-- (the receiver is retired in the same change) and nothing depends on them: no
-- trigger, view or other function (checked on the configured project).
--
-- KEPT, on purpose:
--   * eos_rock_milestone_task_links (15 rows): read by the Rock details panel, and
--     counted by rock_impact() and the delete guard from the Rock lifecycle
--     migration. Dropping it would delete data and change what can be deleted.
--   * eos_task_sync_events (1 row): the audit record of the one synthetic preflight
--     (issue #999999, all-zero milestone, rejected as unknown_milestone).
-- Neither table is written to any more. No row, milestone or progress changes.
--
-- Rollback: rollback/20261028010000_retire_rock_task_sync_functions.down.sql
-- restores both functions verbatim from 20261027130000_rock_task_sync.sql.

DROP FUNCTION IF EXISTS public.apply_rock_task_sync_event(jsonb, bigint);
DROP FUNCTION IF EXISTS public.recompute_rock_milestone_from_tasks(uuid);

COMMENT ON TABLE public.eos_rock_milestone_task_links IS
  'Static snapshots of GitHub task state linked to a milestone. The automatic GitHub sync was retired on 2026-10-28; these rows are no longer updated.';
COMMENT ON TABLE public.eos_task_sync_events IS
  'Delivery log of the retired GitHub task sync. Kept as audit evidence; nothing writes to it any more.';

NOTIFY pgrst, 'reload schema';
