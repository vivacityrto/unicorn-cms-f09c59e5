# Audit: 2026-10-29 — Cleared the 15 stale GitHub task rows from production

**Trigger:** Carl's instruction (29 Oct 2026), following the decision to reconcile Rock milestones by hand and the merge of the To-Do link feature ([rock-todo-links.md](../../kb/codebase-state/rock-todo-links.md)).
**Scope:** production (`yxkgdalkbrriasiyyrwk`) data only. No schema, policy, function or code change.

## What was done
- **Deleted** all 15 rows of `public.eos_rock_milestone_task_links`. They were the only rows the table had: snapshots of GitHub issues #3270–#3284 linked to Rock milestones, all `open` / `backlog`, all written once by the retired `rock-task-sync` webhook on 27 Oct 2026 at 08:51 UTC and never updated since (so they showed tasks as open that had moved on; see [retire-rock-task-sync](2026-10-28-retire-rock-task-sync.md)).
- **Backup first.** The 15 rows were exported in full to a local file (`/home/carl/backups/unicorn-prod/eos_rock_milestone_task_links_2026-10-29.json`, owner-only permissions, kept off the repository because it names internal tasks). The file's checksum over the identifying and display fields (id, key, URL, title, due date, priority, state, status, milestone, tenant, assignees, provider) was compared with the live table's before deleting and matched (`5c5d0f268af9c02926387d54683706b0`).
- **Guarded delete.** The delete ran inside a block that refused unless the table still held exactly 15 rows with that checksum, and failed unless it deleted exactly 15.

## Verified afterwards
0 rows left in the table; 529 milestones, 165 Rocks and 34 To-Dos unchanged; no milestone or progress was modified; no Rock is blocked from deletion by `task_links` any more (the delete guard counted these rows); the new To-Do link table is untouched (0 links).

## Effect
The milestone "Linked tasks" box no longer appears (it only shows when a milestone has linked tasks). Milestone rows and the Rock panel now show To-Dos only. The table, its policies and the `task_links` delete guard remain in place for any future linking.

## Restore
Re-insert the rows from the backup file (a plain insert of the 15 objects into `public.eos_rock_milestone_task_links`, keeping their ids). Nothing else depends on them.
