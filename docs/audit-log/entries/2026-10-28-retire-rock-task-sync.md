# Audit: 2026-10-28 — Retire the GitHub task sync for Rock milestones

**Trigger:** ad-hoc (Carl's decision on 28 Oct 2026 to abandon the automated GitHub-to-Unicorn sync and reconcile Rock milestones with GitHub tasks by hand)
**Scope:** the receiver Edge Function `rock-task-sync`, its payload parser, the two `SECURITY DEFINER` functions behind it, and the documents that described them, in the Unicorn repository and the hosted project `1. Unicorn 2.0-dev` (`yxkgdalkbrriasiyyrwk`). The ComplyHub repository is not touched; Carl has already removed its two repository secrets, which disables the publisher there.
**Status: complete (2026-10-28).** Code merged (PR #1460, `7360acb2e`). The signing secret was removed and the deployed function deleted by Carl, and the migration was applied to `unicorn-qa` (version `20261028004312`) then to the configured project (version `20261028004326`) on Carl's instruction. All verified (see Verification). The one open item is Carl's decision on the 15 frozen task links.

## Findings (read from production on 28 Oct 2026)
- The deployed Edge Function `rock-task-sync` is `ACTIVE`, version 3, `verify_jwt = false`, with source matching the repository. It authenticates only by an HMAC signature, so while `ROCK_TASK_SYNC_SECRET` exists, anyone holding the secret can post an event that moves a milestone.
- The delivery log `eos_task_sync_events` has **one row**: a synthetic preflight for issue `#999999` against the all-zero milestone UUID, outcome `rejected`, reason `unknown_milestone`, received 27 Oct 2026 23:55 UTC. It proves the receiver and secret worked once and that nothing was applied.
- **The sync has not changed any milestone's status.** The log holds no `applied` row (its only row is the rejected preflight), no milestone is `blocked`, and no milestone status has moved. For completeness: since the sync migration was applied (27 Oct 03:53 UTC) the milestone history holds 14 `updated` events on 13 milestones (at 04:45 and 06:13 UTC). None has an actor, all are `not_started` to `not_started`, and each changed other fields, so they are direct database edits to milestone details, not receiver activity (the receiver can only change status, and would have left an `applied` log row). Who made them is not recorded.
- `eos_rock_milestone_task_links` holds **15 rows** across 13 milestones, all open GitHub tasks (`#3270` to `#3284`), created in a single statement at 08:51 UTC on 27 Oct. The delivery log has no row for them, so the receiver did not write them. Who inserted them is not recorded.
- The two functions the receiver called (`apply_rock_task_sync_event`, `recompute_rock_milestone_from_tasks`) are executable only by `service_role`, have no dependents, and are used by no trigger, view or other function. Their only purpose was to apply task events.
- The task-link table is **not** sync-only: the Rock details panel reads it (`MilestoneTasks`, the "Ready for review" derivation), and `rock_impact()` and the delete guard from the Rock lifecycle migration count it. Dropping it would delete the 15 rows and change what can be deleted.

## Decision: what is retired and what is kept
| Item | Action | Why |
| --- | --- | --- |
| `supabase/functions/rock-task-sync/` (receiver and its test) | removed from the repository | the receiver |
| `supabase/functions/_shared/rock-task-sync-payload.ts` and its test | removed | used only by the receiver |
| `[functions.rock-task-sync]` in `supabase/config.toml` | removed | sync-specific configuration |
| `apply_rock_task_sync_event`, `recompute_rock_milestone_from_tasks` | dropped by migration `20261028010000` (rollback restores both verbatim) | the only code that changed a milestone from a task event |
| `eos_rock_milestone_task_links` (15 rows) | **kept**, comment added | existing data; read by the panel and the delete guard |
| `eos_task_sync_events` (1 row) | **kept**, comment added | audit evidence of the preflight; the row is not deleted |
| `_shared/webhook-signature.ts` | kept | shared with other webhook receivers |
| Rock details panel task display | kept unchanged (comment only) | it shows preserved data; see "Decisions for Carl" |
| Already-applied migration `20261027130000` | untouched | append-only |

## Code changes
- Removed: `supabase/functions/rock-task-sync/index.ts`, `.../fail-closed.test.mjs`, `supabase/functions/_shared/rock-task-sync-payload.ts`, `.../rock-task-sync-payload.node-test.ts`; the `rock-task-sync` block in `supabase/config.toml`; the two function entries in `src/integrations/supabase/types.ts`.
- Added: `supabase/migrations/20261028010000_retire_rock_task_sync_functions.sql` and `supabase/migrations/rollback/20261028010000_retire_rock_task_sync_functions.down.sql`; reviewed allowlist entries for both in `supabase/migration-safety-allowlist.json`.
- Documents: `docs/kb/codebase-state/rock-task-sync.md` now opens as retired and has a "What remains" section; `docs/kb/handoffs/rock-task-sync-publisher.md` is marked withdrawn; both READMEs and `docs/audit-log/INDEX.md` updated; the 27 Oct audit entry points here.
- Merging this does **not** undeploy anything: the deploy-on-merge workflow only deploys functions that still exist, so it will deploy nothing and leave the live function in place.

## Human actions (all done 28 Oct 2026)
1. **Secret removed** by Carl. Verified from outside: an empty, unsigned request to the receiver answered 500 "Webhook is not configured" (the fail-closed path), which is only possible with no secret.
2. **Deployed function deleted** by Carl after #1460 merged. Verified from outside: the receiver URL answers 404 `NOT_FOUND` "Requested function was not found" to POST and GET, and Supabase's own lookup reports "Function not found".
3. **Migration applied** to `unicorn-qa`, then to the configured project, on Carl's instruction.

## Decisions for Carl
- **The 15 task links are frozen snapshots** (all "backlog / open", none updated). The Rock panel still shows them as if current, with no "as of" date. Options: leave as is; add an "as of" date to the panel; hide the panel's task section; or clear the rows. Clearing or hiding is a separate change and was not done here.
- **The one log row** is preserved as audit evidence. Deleting it would need your explicit say-so.

## Verification
- Rollback bodies are byte-identical to the originals (md5 `ced27d69...` for `recompute_rock_milestone_from_tasks`, `bba588e8...` for `apply_rock_task_sync_event`), and equal to the bodies currently in production.
- Read-only inspection of production only; no write, deployment or secret access. See the pull request for check results.
- **Migration applied and verified (28 Oct 2026).** Before: both functions present on both projects with the bodies the rollback restores (md5 `bba588e8...` and `ced27d69...`), neither table commented. After, on `unicorn-qa` (version `20261028004312`) and the configured project (version `20261028004326`): neither function exists; both tables exist; both table comments are set; `eos_rock_milestone_task_links` still grants `SELECT` to `authenticated` only and keeps its one policy.
- **Data unchanged on the configured project:** 15 task links (all open, 13 milestones), 1 delivery-log row (the rejected `#999999` preflight, reason `unknown_milestone`), 498 milestones with 137 not in `not_started` (unchanged by this work), and no new milestone event since the last one recorded. QA has no Rock data and none was added.
- **Dependents still work:** `rock_impact()` on a real Rock (rolled-back transaction as an active staff user) still reports the 15 task links and the delete blockers. `rock_delete_blockers()` is intentionally not callable by signed-in users.
- **Unrelated movement noted:** Rocks went from 156 to 159 between this work's first read and the migration check. The three are Individual Rocks created through the new Rock editor (with `created_by` and a `created` history event), not by anything in this retirement.
- **Open decision:** the 15 task links are frozen snapshots still shown by the Rock panel. Left as is until Carl decides.
