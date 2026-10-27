# Handoff: build the ComplyHub-side publisher for the Rock task sync

> **Last updated:** 2026-10-27 · **Reconsider by:** 2027-01-27 · **Audience:** Codex and Khian, implementing in `ComplyHub-ai/rto-compass-hub` · **Owner of the integration:** Carl · **Confidence:** high on the Unicorn receiver (built, deployed, verified); medium on the ComplyHub-side details, which were read from the repository on 27 October 2026 and should be re-checked against `main` before you start.

This brief is self-contained. You do not need the conversation it came from. It tells you what already exists on the Unicorn side, what you are building, the exact contract, how to test it without guessing, and what you must not do.

## 1. Goal, in one paragraph

GitHub `[task]` issues in `ComplyHub-ai/rto-compass-hub` already name the Unicorn milestone they serve (`**Linked:** Unicorn milestone UUID <uuid> …`). Unicorn now has a receiver that turns a task's state into progress on that milestone. Nothing sends it events yet. **Your job is a second publisher, beside the existing Planner one, that signs each task event and posts it to Unicorn.** GitHub stays authoritative and the flow is one-way: Unicorn never writes back to GitHub.

## 2. What Unicorn does with an event (already live)

| Linked task state | Milestone effect |
| --- | --- |
| A task `in progress` or `review`, or any task closed | `not_started` → `in_progress` |
| An open task `blocked` | `not_started` / `in_progress` → `blocked` |
| No blocked task remains | A block the sync set is released, but only if nobody has edited the milestone since. A person's block is never released. |
| Every linked task closed | **No status change.** Unicorn shows "Ready for review". A person marks the milestone complete. |

It never touches `complete`, `deferred` or `off_track`, and never completes anything. A milestone may have several tasks (decomposed work shares one milestone UUID), so every rule is evaluated across all of its tasks. This matches the crosswalk rule that a task does not grant approval or replace the initiative's evidence gates. Do not try to change this policy from the sender.

State on 27 October 2026: the database changes are applied in Unicorn's QA and production projects; the receiver `rock-task-sync` is deployed in production at version 1; **it has no signing secret yet, so it answers 500 to every request.** Carl sets the secret on the Unicorn side when you are ready to test (section 8). Full detail: `docs/kb/codebase-state/rock-task-sync.md` and `docs/audit-log/entries/2026-10-27-rock-task-sync.md` in the Unicorn repository (`vivacityrto/unicorn-cms-f09c59e5`).

## 3. What you are building

1. **A publisher script**, for example `scripts/task-unicorn-sync.mjs`, modelled on `scripts/task-planner-notify.mjs`. Reuse `taskEventPayload` so both publishers send the identical event, and reuse the same "not a managed task, nothing posted" behaviour.
2. **A workflow job** that runs it on the same Issue events as `task-planner-sync.yml` (`opened, reopened, closed, edited, labeled, assigned, unassigned`), with the same `if` filter, the same "read the latest Issue snapshot first" step, and its own concurrency group (`unicorn-sync-${{ github.repository }}-${{ github.event.issue.number }}`, `cancel-in-progress: true`).
3. **Tests** for signing, payload shape, retries and the no-op path (section 7).
4. **A backfill mode** (section 6).

**Make it a separate job from the Planner publisher**, so a Unicorn outage cannot block Planner and the reverse. A failing Unicorn job should still show red so someone notices.

### Things the existing code makes easy to get wrong

- `postTaskEvent` serialises the payload itself with `JSON.stringify(payload)`. A signature must cover **the exact bytes sent**, so serialise **once**, sign that string, and send that same string. Write a small `postSignedEvent(url, secret, payload, options)` that does exactly this and keep the existing retry loop (retry on 429 and 5xx, fail fast on other 4xx). Its error text must not say "Planner".
- Send the `updatedAt` of the **latest** snapshot, not the event's older copy. Unicorn orders events per task by `github.updatedAt` and ignores older ones as stale. The workflow already re-reads the issue before publishing; keep that.
- The event id is `${projectionKey}:${updatedAt}`. GitHub timestamps have one-second resolution, so two events in the same second share an id and the second is acknowledged as a duplicate. This is harmless because both read the same latest snapshot.
- Do nothing when the URL secret is unset (log one line), exactly like the Planner script, so the workflow can merge before secrets exist.
- Never print the secret, the URL or the signature. GitHub masks secrets, but not values derived from them.

## 4. The contract

**Request:** `POST` to the Unicorn production receiver, path `/functions/v1/rock-task-sync`. Carl supplies the full URL; store it as a repository secret.

```
Content-Type: application/json
X-Signature-256: sha256=<lowercase hex of HMAC-SHA256(secret, raw request body)>
```

The `sha256=` prefix is required; a bare digest is rejected. The body is the event `taskEventPayload` already builds (schemaVersion 1). A minimal valid one:

```json
{
  "schemaVersion": 1,
  "source": "github",
  "event": "edited",
  "eventId": "ComplyHub-ai/rto-compass-hub#123:2026-10-27T05:00:00Z",
  "github": {
    "repository": "ComplyHub-ai/rto-compass-hub",
    "issueNumber": 123,
    "projectionKey": "ComplyHub-ai/rto-compass-hub#123",
    "url": "https://github.com/ComplyHub-ai/rto-compass-hub/issues/123",
    "title": "[task] Example",
    "state": "open",
    "updatedAt": "2026-10-27T05:00:00Z"
  },
  "task": {
    "kind": "task",
    "title": "Example",
    "summary": "…Unicorn milestone UUID 00000000-0000-0000-0000-000000000000…",
    "priority": "HIGH",
    "status": "in progress",
    "due": "2026-11-20",
    "assignees": ["some-login"],
    "raisedBy": "some-login",
    "linked": "Unicorn milestone UUID 00000000-0000-0000-0000-000000000000 (label)"
  }
}
```

Extra fields (`calendar`, `labels`) are ignored, so you do not need to strip them.

**How Unicorn finds the milestone.** In order: an optional top-level `"unicorn": { "milestoneId": "<uuid>" }`, then a UUID inside `task.linked`, then one inside `task.summary`. **Recommended:** parse the UUID once in the publisher from the `**Linked:**` field and send it as `unicorn.milestoneId`, so the receiver never has to guess from free text. Two different UUIDs is an error (400). No UUID is not an error: Unicorn replies 200 `ignored`.

**Rules Unicorn enforces** (so you can test the same ones):

- `schemaVersion` must be `1` and `source` must be `"github"`.
- `github.repository` must be `ComplyHub-ai/rto-compass-hub` (case-insensitive).
- `github.url` must be an `https://github.com/<repository>/issues/…` URL.
- Only `task.kind: "task"` is applied; asks are acknowledged and ignored.
- `github.state` is `open` or `closed`; a closed issue is always treated as `completed`, whatever `task.status` says.
- `task.status` is one of `backlog`, `ready`, `in progress`, `blocked`, `review`, `completed` (default `backlog`).
- `task.due` is `YYYY-MM-DD` or null. At most 20 assignees. Body at most 64 KB. Title at most 500 characters.

**Responses and what your sender should do:**

| Response | Meaning | Sender |
| --- | --- | --- |
| 200 with `outcome` `applied`, `duplicate`, `stale` or `ignored` | Handled | Done |
| 400 `invalid_payload` (with a `reason`) or `invalid_json` | The event is wrong | Do not retry; fail the job and log the reason |
| 401 | Bad or missing signature | Do not retry; fail the job |
| 413 | Body too large | Do not retry |
| 422 `rejected` | The milestone UUID is not found in the expected tenant | Do not retry; fail the job so the link gets corrected |
| 500 | Not configured, or a database error | Retry (the call is idempotent) |

A 200 `applied` body looks like `{"outcome":"applied","milestone_id":"…","status_changed":true,"status":"in_progress","ready_for_review":false}`.

**Signing in Node**, as a check you can compare against:

```js
import { createHmac } from 'node:crypto';
const body = JSON.stringify(payload);                       // serialise once
const signature = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Signature-256': signature }, body });
```

**Known-answer vectors** (secret `test-secret`). If your implementation does not reproduce these, it will get 401:

| Body (exact string) | `X-Signature-256` |
| --- | --- |
| `{"hello":"world"}` | `sha256=84cc33df716ed0b0598f07437c94069ace3730358778a592bd6bbd1423d111f3` |
| `{"a":1,"b":[1,2]}` | `sha256=ab19d644533212edeab87a243f1bebe8b10dd3186d688b77abe53ce6804973bb` |

## 5. Secrets and ownership

- Two repository secrets on `ComplyHub-ai/rto-compass-hub`: `UNICORN_ROCK_TASK_SYNC_URL` and `UNICORN_ROCK_TASK_SYNC_SECRET`. Names only appear in code and docs; values never go in the repository, a PR, a KB record or a log.
- The signing secret is generated once and set on **both** sides (the Unicorn function's `ROCK_TASK_SYNC_SECRET`, and your repository secret). Carl owns that exchange. Do not invent or request the value in a thread; ask Carl, and he sets it out of band.
- Unicorn also reads `ROCK_TASK_SYNC_TENANT_ID` and `ROCK_TASK_SYNC_REPOSITORIES`, both with correct defaults. No action for you.

## 6. Backfill

About 40 `[task]` issues already exist. Provide a way to publish them once: a `workflow_dispatch` job or a script flag that lists open `[task]` issues and posts each one's **current** snapshot. Events are idempotent, so running it twice is safe.

- **Include a `--dry-run`** that prints, for each issue, the milestone UUID, `task.status`, state and what you would send, and posts nothing. Run it first and give the output to Carl.
- **A backfill has real effects the moment it runs.** Any already-started task moves its milestone to `in_progress`, and any blocked task blocks it. At the time of writing every milestone was `not_started`, so the visible change should be small, but read the dry run before you post anything.
- Pace it (a pause between posts is enough) and stop on the first 401.

## 7. Tests you must write

Test the **exact request** locally with representative success and failure responses. Do not discover transport defects through repeated live runs.

- Signature: reproduces both known-answer vectors above; signs the same string it sends; a different secret gives a different signature.
- Payload: a task with a milestone link produces the event (with `unicorn.milestoneId` if you add it); an ask, a non-task issue, and a task with no milestone link post nothing or are acknowledged as ignored; closed issues send `state: "closed"`.
- Retry: 429 and 5xx are retried with backoff; 400, 401 and 422 are not; a network error is retried; the final failure is thrown.
- No-op: unset URL logs one line and posts nothing; the secret never appears in output.
- Workflow: the new job does not depend on, and cannot be blocked by, the Planner job.

## 8. Rollout, in order

1. **Build and review** under the ComplyHub repository's own rules. Nothing in this brief waives its gates: check its `AGENTS.md`, its KB and task/ask workflows, its labels (a workflow that sends data to an outside service is the kind of change its governance labels are for) and its review requirements. Record the decision in the KB the way that repository requires.
2. **Preflight, no real change.** With secrets set, post one correctly signed event whose milestone UUID is all zeros. Expect **422 `rejected`**. That proves URL, signature and payload parsing end to end while changing no milestone (it writes one `rejected` row to Unicorn's delivery log).
3. **One canary.** Publish a single real task and have the Unicorn side confirm the milestone and the link row.
4. **Postflight read.** The Unicorn side checks the link row, the delivery log (`eos_task_sync_events`) and the milestone's status. You do not have database access to Unicorn; ask Carl.
5. **Backfill** (section 6), only after Carl has read the dry run.

## 9. Do not

- Write to Unicorn's database, or use any Unicorn credential other than the signing secret.
- Change the Planner publisher's behaviour or payload.
- Make Unicorn the authority, or add a Unicorn-to-GitHub return path.
- Auto-close, auto-label or comment on issues from this publisher.
- Map GitHub logins to Unicorn users. Assignee logins are stored as text on purpose.
- Send anything for asks, or for issues that are not `[task]`.

## 10. Open decisions for Carl

1. **Cross-organisation flow.** Task titles and states from `ComplyHub-ai` flow into Vivacity's Unicorn project. Carl to confirm this is intended before secrets are set.
2. **Backfill.** Whether to run it at all, once the dry run has been read.
3. **Failure behaviour.** Recommended default: a failing Unicorn job turns the run red but never blocks Planner. Say if you want it softer.

## 11. Related

- Planner bridge and its Planner-to-GitHub return path (F-717, F-733): owned by Khian. A Planner completion should reach Unicorn only by first reaching GitHub, so there is one authority and no loop. This brief does not change that path.
- Unicorn contract and rollout: [rock-task-sync.md](../codebase-state/rock-task-sync.md). Audit entry: [2026-10-27-rock-task-sync.md](../../audit-log/entries/2026-10-27-rock-task-sync.md).
