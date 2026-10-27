# Rock task sync (GitHub tasks → Unicorn milestones)

> **Last updated:** 2026-10-27 · **Reconsider by:** 2027-01-27 · **Confidence:** high on the database behaviour (dry-run in a rolled-back `unicorn-qa` transaction, 13 policy scenarios plus the human-block and restore cases); medium on the sender side, which is proposed and not yet built.
>
> **Status:** receiver, tables and Rock-panel display are written and tested. **The migration is applied to `unicorn-qa` and to production (both verified 2026-10-27); the Edge Function has no secret, and nothing sends events yet, so no milestone has been changed by the sync.** See "Rollout" below.

GitHub `[task]` issues in `ComplyHub-ai/rto-compass-hub` already carry `Linked: Unicorn milestone UUID <uuid>`. This sync turns that link into live progress on the Unicorn milestone. GitHub stays authoritative: the sync is one-way, and Unicorn never writes back.

## Policy (decided by Carl, 2026-10-27)

| Linked task state | Milestone effect |
| --- | --- |
| Any task `in progress` or `review`, or any task closed | `not_started` → `in_progress` |
| Any **open** task `blocked` | `not_started` / `in_progress` → `blocked` |
| No open blocked task remains | A block **the sync set** is released (to `in_progress`, or the prior status if no task has started), only if nobody has edited the milestone since. A human's block is never released. |
| Every linked task closed | **No status change.** The panel shows "Ready for review" (derived, not stored). A person marks the milestone complete in Unicorn. |

The sync never touches `complete`, `deferred` or `off_track`, and never completes anything. This matches the crosswalk rule that a task does not grant approval or replace the initiative's evidence gates. A milestone can have many tasks (for example R0-a/b/c share one), so every rule above is evaluated across all of its linked tasks.

## Data model (`20261027130000_rock_task_sync.sql`)

- `eos_rock_milestone_task_links`: one row per task (`provider`, `external_key` unique), with state, status, due date, assignees and the source revision. Readable like milestones; written only by the sync.
- `eos_task_sync_events`: delivery log, one row per event id, with `outcome` (`applied`, `stale`, `rejected`) and the milestone's status before and after. Service-role only. It also records the milestone's `updated_at` after a sync-made change, which is how a later human edit is detected.
- `apply_rock_task_sync_event(event, expected_tenant_id)` and `recompute_rock_milestone_from_tasks(milestone_id)`: `SECURITY DEFINER`, executable by `service_role` only. One transaction per event.

Idempotency: a repeated event id returns `duplicate`; an event older than the stored revision (`github.updatedAt`) returns `stale` and changes nothing; a retry of a `rejected` event is re-evaluated.

## Receiver contract (`supabase/functions/rock-task-sync`)

`POST /functions/v1/rock-task-sync`, no Supabase auth header. Authentication is an HMAC over the raw body:

```
X-Signature-256: sha256=<hex HMAC-SHA256(ROCK_TASK_SYNC_SECRET, raw body)>
```

The body is the event `scripts/task-planner-notify.mjs` already builds for the Planner bridge (schemaVersion 1). The milestone UUID is read from an optional `unicorn.milestoneId`, otherwise from `task.linked`, otherwise from `task.summary`. Two different UUIDs is an error.

| Response | Meaning | Sender should |
| --- | --- | --- |
| 200 `applied` / `duplicate` / `stale` / `ignored` | Handled. `ignored` is an ask, or a task with no milestone link. | Done |
| 400 | Unreadable or invalid payload (reason in body) | Do not retry; fix the payload |
| 401 | Bad or missing signature | Do not retry |
| 413 | Body over 64 KB | Do not retry |
| 422 | `rejected`: milestone not found in the expected tenant | Do not retry; correct the link |
| 500 | Not configured, or the database call failed | Retry (the call is idempotent) |

Environment (names only): `ROCK_TASK_SYNC_SECRET` (required; missing means every request gets 500), `ROCK_TASK_SYNC_TENANT_ID` (default `6372`), `ROCK_TASK_SYNC_REPOSITORIES` (default `ComplyHub-ai/rto-compass-hub`).

## Display

The Rock details panel lists each milestone's linked tasks (title linking to the issue, status, assignees, due date), a `n blocked` badge, `Tasks · x of y closed`, and "Ready for review". It tolerates the links table not existing yet, so the frontend can deploy before the migration.

## ComplyHub side (proposed; owned by the task-workflow owners, not built here)

Add a second publisher beside the Planner one in `.github/workflows/task-planner-sync.yml`, reusing `taskEventPayload` from `scripts/task-planner-notify.mjs`: build the same payload, `JSON.stringify` it once, sign that exact string with HMAC-SHA256, and POST it with the existing 429/5xx retry. Repository secrets (names only): `UNICORN_ROCK_TASK_SYNC_URL`, `UNICORN_ROCK_TASK_SYNC_SECRET`. Like the Planner step, do nothing when the URL is unset. The Planner leg stays a projection: a Planner completion should reach Unicorn only by first reaching GitHub (the return path F-717 describes), so there is one authority and no loop.

## Rollout (step 2 is done; steps 1 and 3 to 5 are not)

1. Review and merge the PR. Merging deploys the function; with no secret set it returns 500 to every request, which is safe.
2. Apply the migration to `unicorn-qa`, verify, then production (Supabase MCP; allowlist entry `rock-task-sync` expires 2026-11-27). **Done and verified on `unicorn-qa` and on production (2026-10-27).**
3. Set the three function secrets in the Unicorn Supabase project.
4. Land the ComplyHub-side publisher and secrets.
5. Backfill: re-publish the open `[task]` issues once (events are idempotent) so existing tasks link up.

## Not in scope

No direct Planner/Teams → Unicorn path; no GitHub-login → Unicorn-user mapping (assignees are stored as logins); no automatic completion; no change to the existing milestone audit trigger (sync-made changes are attributable through `eos_task_sync_events`).
