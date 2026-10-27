import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTaskEventPayload } from "./rock-task-sync-payload.ts";

const MILESTONE = "0cfb1c51-8dc2-4546-6172-7763658f51a7";
const OPTIONS = { allowedRepositories: ["ComplyHub-ai/rto-compass-hub"] };

const payload = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  source: "github",
  event: "edited",
  eventId: "ComplyHub-ai/rto-compass-hub#3293:2026-10-27T05:00:00Z",
  github: {
    repository: "ComplyHub-ai/rto-compass-hub",
    issueNumber: 3293,
    projectionKey: "ComplyHub-ai/rto-compass-hub#3293",
    url: "https://github.com/ComplyHub-ai/rto-compass-hub/issues/3293",
    title: "[task] Deliver initial tenant-isolation suite",
    state: "open",
    updatedAt: "2026-10-27T05:00:00Z",
  },
  task: {
    kind: "task",
    title: "Deliver initial tenant-isolation suite",
    summary: `M14-initial; Unicorn milestone UUID ${MILESTONE}; exit criteria: run the cases`,
    priority: "critical",
    status: "in progress",
    due: "2026-11-20",
    assignees: ["KhianBrian"],
    raisedBy: "carlmattsimpao",
    linked: `Unicorn milestone UUID ${MILESTONE} (M14-initial)`,
  },
  ...overrides,
});

const withTask = (task: Record<string, unknown>) => payload({ task: { ...payload().task, ...task } });
const withGithub = (github: Record<string, unknown>) => payload({ github: { ...payload().github, ...github } });

test("maps a valid open task to the RPC event shape", () => {
  const result = parseTaskEventPayload(payload(), OPTIONS);
  assert.ok(result.ok);
  assert.deepEqual(result.event, {
    event_id: "ComplyHub-ai/rto-compass-hub#3293:2026-10-27T05:00:00Z",
    provider: "github",
    external_key: "ComplyHub-ai/rto-compass-hub#3293",
    external_url: "https://github.com/ComplyHub-ai/rto-compass-hub/issues/3293",
    title: "Deliver initial tenant-isolation suite",
    task_state: "open",
    task_status: "in progress",
    priority: "CRITICAL",
    due_date: "2026-11-20",
    assignees: ["KhianBrian"],
    source_updated_at: "2026-10-27T05:00:00.000Z",
    milestone_id: MILESTONE,
  });
});

test("a closed issue always projects as completed, whatever its status field says", () => {
  const result = parseTaskEventPayload(
    payload({ github: { ...payload().github, state: "closed" }, task: { ...payload().task, status: "backlog" } }),
    OPTIONS,
  );
  assert.ok(result.ok);
  assert.equal(result.event.task_state, "closed");
  assert.equal(result.event.task_status, "completed");
});

test("prefers an explicit unicorn.milestoneId over text in Linked/Summary", () => {
  const other = "11111111-2222-3333-4444-555555555555";
  const result = parseTaskEventPayload(payload({ unicorn: { milestoneId: other.toUpperCase() } }), OPTIONS);
  assert.ok(result.ok);
  assert.equal(result.event.milestone_id, other);
});

test("finds the milestone in the summary when Linked has no UUID", () => {
  const result = parseTaskEventPayload(withTask({ linked: "#2935" }), OPTIONS);
  assert.ok(result.ok);
  assert.equal(result.event.milestone_id, MILESTONE);
});

test("ignores asks and tasks that link no milestone", () => {
  assert.deepEqual(parseTaskEventPayload(withTask({ kind: "ask" }), OPTIONS), { ok: false, kind: "ignored", reason: "not_a_task" });
  const noLink = parseTaskEventPayload(withTask({ linked: "#2935", summary: "no uuid here" }), OPTIONS);
  assert.deepEqual(noLink, { ok: false, kind: "ignored", reason: "no_unicorn_milestone" });
});

test("rejects two different milestone UUIDs as ambiguous", () => {
  const result = parseTaskEventPayload(
    withTask({ linked: `${MILESTONE} and 11111111-2222-3333-4444-555555555555` }),
    OPTIONS,
  );
  assert.deepEqual(result, { ok: false, kind: "invalid", reason: "ambiguous_milestone" });
});

test("treats the same UUID repeated in Linked and Summary as one milestone", () => {
  assert.ok(parseTaskEventPayload(payload(), OPTIONS).ok);
});

test("rejects a repository that is not allowlisted, case-insensitively matching the ones that are", () => {
  const bad = parseTaskEventPayload(withGithub({ repository: "someone/else" }), OPTIONS);
  assert.deepEqual(bad, { ok: false, kind: "invalid", reason: "repository_not_allowed" });
  const lower = parseTaskEventPayload(
    withGithub({
      repository: "complyhub-ai/RTO-compass-hub",
      url: "https://github.com/complyhub-ai/rto-compass-hub/issues/3293",
    }),
    OPTIONS,
  );
  assert.ok(lower.ok);
});

test("rejects an issue URL outside the repository", () => {
  const result = parseTaskEventPayload(withGithub({ url: "https://evil.example/ComplyHub-ai/rto-compass-hub/issues/1" }), OPTIONS);
  assert.deepEqual(result, { ok: false, kind: "invalid", reason: "bad_issue_url" });
});

test("rejects unsupported schema, source and non-object payloads", () => {
  assert.equal(parseTaskEventPayload("nope", OPTIONS).ok, false);
  assert.deepEqual(parseTaskEventPayload(payload({ schemaVersion: 2 }), OPTIONS), { ok: false, kind: "invalid", reason: "unsupported_schema_version" });
  assert.deepEqual(parseTaskEventPayload(payload({ source: "planner" }), OPTIONS), { ok: false, kind: "invalid", reason: "unsupported_source" });
});

test("validates state, status, dates and assignees", () => {
  assert.equal((parseTaskEventPayload(withGithub({ state: "merged" }), OPTIONS) as { reason: string }).reason, "bad_state");
  assert.equal((parseTaskEventPayload(withTask({ status: "done" }), OPTIONS) as { reason: string }).reason, "bad_task_status");
  assert.equal((parseTaskEventPayload(withTask({ due: "2026-02-30" }), OPTIONS) as { reason: string }).reason, "bad_due_date");
  assert.equal((parseTaskEventPayload(withTask({ due: "20/11/2026" }), OPTIONS) as { reason: string }).reason, "bad_due_date");
  assert.equal((parseTaskEventPayload(withGithub({ updatedAt: "yesterday" }), OPTIONS) as { reason: string }).reason, "bad_updated_at");
  assert.equal((parseTaskEventPayload(withTask({ assignees: "khian" }), OPTIONS) as { reason: string }).reason, "bad_assignees");
  assert.equal((parseTaskEventPayload(withTask({ assignees: [""] }), OPTIONS) as { reason: string }).reason, "bad_assignees");
  assert.equal((parseTaskEventPayload(withTask({ assignees: Array(21).fill("a") }), OPTIONS) as { reason: string }).reason, "bad_assignees");
});

test("accepts a null or missing due date and defaults the status to backlog", () => {
  const result = parseTaskEventPayload(withTask({ due: null, status: undefined, priority: undefined }), OPTIONS);
  assert.ok(result.ok);
  assert.equal(result.event.due_date, null);
  assert.equal(result.event.task_status, "backlog");
  assert.equal(result.event.priority, null);
});

test("falls back to the issue title without its [task] prefix, and builds an event id when none is sent", () => {
  const { eventId: _eventId, ...rest } = payload() as Record<string, unknown>;
  const result = parseTaskEventPayload({ ...rest, task: { ...payload().task, title: undefined } }, OPTIONS);
  assert.ok(result.ok);
  assert.equal(result.event.title, "Deliver initial tenant-isolation suite");
  assert.equal(result.event.event_id, "ComplyHub-ai/rto-compass-hub#3293:2026-10-27T05:00:00Z");
});

test("rejects oversized fields", () => {
  assert.equal((parseTaskEventPayload(withTask({ title: "x".repeat(501) }), OPTIONS) as { reason: string }).reason, "bad_title");
  assert.equal((parseTaskEventPayload(withGithub({ projectionKey: "k".repeat(201) }), OPTIONS) as { reason: string }).reason, "bad_projection_key");
});
