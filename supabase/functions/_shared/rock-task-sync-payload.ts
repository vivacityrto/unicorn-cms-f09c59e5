/**
 * Parses the GitHub task event the ComplyHub repo already publishes for its
 * Planner bridge (schemaVersion 1) into the shape apply_rock_task_sync_event()
 * expects. Pure and Deno-free so it can be unit-tested with node --test.
 *
 * Only `[task]` events that link to a Unicorn milestone UUID are applied.
 * Asks and tasks with no milestone link are acknowledged and ignored.
 */

export const TASK_STATUSES = ["backlog", "ready", "in progress", "blocked", "review", "completed"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface RockTaskSyncEvent {
  event_id: string;
  provider: "github";
  external_key: string;
  external_url: string;
  title: string;
  task_state: "open" | "closed";
  task_status: TaskStatus;
  priority: string | null;
  due_date: string | null;
  assignees: string[];
  source_updated_at: string;
  milestone_id: string;
}

export type ParseResult =
  | { ok: true; event: RockTaskSyncEvent }
  | { ok: false; kind: "ignored" | "invalid"; reason: string };

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TASK_PREFIX = /^\[task\]\s*/i;

const MAX_KEY = 200;
const MAX_TITLE = 500;
const MAX_ASSIGNEES = 20;
const MAX_LOGIN = 100;

type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const str = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

const invalid = (reason: string): ParseResult => ({ ok: false, kind: "invalid", reason });
const ignored = (reason: string): ParseResult => ({ ok: false, kind: "ignored", reason });

function validDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

/** Distinct milestone UUIDs named by the explicit field, else by the task's Linked/Summary text. */
function milestoneIds(unicorn: unknown, task: Obj): string[] {
  const explicit = isObj(unicorn) ? str(unicorn.milestoneId) : null;
  const sources = explicit ? [explicit] : [str(task.linked), str(task.summary)];
  const found = new Set<string>();
  for (const source of sources) {
    if (!source) continue;
    for (const match of source.match(UUID_RE) ?? []) found.add(match.toLowerCase());
  }
  return [...found];
}

export function parseTaskEventPayload(
  raw: unknown,
  options: { allowedRepositories: readonly string[] },
): ParseResult {
  if (!isObj(raw)) return invalid("payload_not_an_object");
  if (raw.schemaVersion !== 1) return invalid("unsupported_schema_version");
  if (raw.source !== "github") return invalid("unsupported_source");

  const github = raw.github;
  if (!isObj(github)) return invalid("missing_github");
  const repository = str(github.repository);
  if (!repository) return invalid("missing_repository");
  const allowed = options.allowedRepositories.map(r => r.toLowerCase());
  if (!allowed.includes(repository.toLowerCase())) return invalid("repository_not_allowed");

  const task = raw.task;
  if (!isObj(task) || task.kind !== "task") return ignored("not_a_task");

  const projectionKey = str(github.projectionKey);
  if (!projectionKey || projectionKey.length > MAX_KEY) return invalid("bad_projection_key");

  const url = str(github.url);
  const urlPrefix = `https://github.com/${repository}/issues/`.toLowerCase();
  if (!url || !url.toLowerCase().startsWith(urlPrefix)) return invalid("bad_issue_url");

  const state = str(github.state)?.toLowerCase();
  if (state !== "open" && state !== "closed") return invalid("bad_state");

  const updatedAt = str(github.updatedAt);
  if (!updatedAt || Number.isNaN(Date.parse(updatedAt))) return invalid("bad_updated_at");

  const ids = milestoneIds(raw.unicorn, task);
  if (ids.length === 0) return ignored("no_unicorn_milestone");
  if (ids.length > 1) return invalid("ambiguous_milestone");

  const rawStatus = str(task.status)?.toLowerCase() ?? "backlog";
  if (!(TASK_STATUSES as readonly string[]).includes(rawStatus)) return invalid("bad_task_status");
  // A closed issue always projects as completed, matching the Planner bridge.
  const taskStatus: TaskStatus = state === "closed" ? "completed" : (rawStatus as TaskStatus);

  const rawDue = task.due == null || task.due === "" ? null : str(task.due);
  if (rawDue !== null && !validDate(rawDue)) return invalid("bad_due_date");

  const assigneesRaw = task.assignees ?? [];
  if (!Array.isArray(assigneesRaw) || assigneesRaw.length > MAX_ASSIGNEES) return invalid("bad_assignees");
  const assignees: string[] = [];
  for (const login of assigneesRaw) {
    const value = str(login);
    if (!value || value.length > MAX_LOGIN) return invalid("bad_assignees");
    assignees.push(value);
  }

  const title = (str(task.title) ?? str(github.title)?.replace(TASK_PREFIX, "") ?? "").trim();
  if (!title || title.length > MAX_TITLE) return invalid("bad_title");

  const priority = str(task.priority);
  if (priority !== null && priority.length > 20) return invalid("bad_priority");

  const eventId = str(raw.eventId) ?? `${projectionKey}:${updatedAt}`;
  if (eventId.length > MAX_KEY * 2) return invalid("bad_event_id");

  return {
    ok: true,
    event: {
      event_id: eventId,
      provider: "github",
      external_key: projectionKey,
      external_url: url,
      title,
      task_state: state,
      task_status: taskStatus,
      priority: priority ? priority.toUpperCase() : null,
      due_date: rawDue,
      assignees,
      source_updated_at: new Date(updatedAt).toISOString(),
      milestone_id: ids[0],
    },
  };
}
