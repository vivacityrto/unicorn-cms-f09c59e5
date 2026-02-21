/**
 * Column mapping configurations for ClickUp CSV imports.
 * Two modes: Raw ClickUp Export → clickup_tasks, Dashboard Export → clickup_tasksdb
 */

/** JSONB columns in clickup_tasks that need JSON parsing */
const CLICKUP_TASKS_JSONB_COLS = new Set([
  "assignees", "tags", "checklists", "comments", "assigned_comments", "attachments",
]);

/**
 * Raw ClickUp Export → clickup_tasks
 * CSV headers map 1:1 to DB columns (same names).
 */
const CLICKUP_TASKS_COLUMNS = new Set([
  "task_id", "task_custom_id", "task_name", "task_content", "status",
  "date_created", "date_created_text", "due_date", "due_date_text",
  "start_date", "start_date_text", "parent_id",
  "assignees", "tags", "priority", "list_name", "folder_name_path", "space_name",
  "time_estimated", "time_estimated_text",
  "checklists", "comments", "assigned_comments", "attachments",
  "time_spent", "time_spent_text", "rolled_up_time", "rolled_up_time_text",
]);

/**
 * Dashboard Export → clickup_tasksdb
 * Headers match DB columns directly — pass through with minimal normalisation.
 */
const CLICKUP_TASKSDB_COLUMNS = new Set([
  "task_id", "task_custom_id", "task_name", "status", "task_content",
  "assignee", "priority", "latest_comment", "comment_count", "assigned_comment_count",
  "due_date", "start_date", "date_created", "date_updated", "date_closed", "date_done",
  "created_by", "space", "folder", "list", "tags",
  "time_logged", "time_logged_rolled_up", "time_estimate", "time_estimate_rolled_up",
  "time_in_status", "points_estimate", "points_estimate_rolled_up",
  "cricos_rereg_date", "mb_level", "mock_audit", "notes", "tenant_id",
  "working_hours", "unicorn_url", "sharepoint_url", "date_of_last_contact",
  "time_remaining", "audit_date", "client_meeting_attendance",
  "date_of_last_systemscheck", "email_address", "infusionsoft_url",
  "phone", "rto_id", "registered_spr", "registration_date", "risk",
  "submission_date", "time_with_vivacity", "nothing_here",
  "on_hold_end_date", "on_hold_start_date", "re_reg_due_date",
  "linked_tasks", "linked_docs", "task_type",
]);

function tryParseJson(val: string): unknown {
  try {
    return JSON.parse(val);
  } catch {
    return val.split(",").map((s) => s.trim()).filter(Boolean);
  }
}

export type ImportMode = "clickup_tasks" | "clickup_tasksdb";

export function mapRowForTable(
  csvRow: Record<string, string>,
  mode: ImportMode
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  const validCols = mode === "clickup_tasks" ? CLICKUP_TASKS_COLUMNS : CLICKUP_TASKSDB_COLUMNS;
  const jsonbCols = mode === "clickup_tasks" ? CLICKUP_TASKS_JSONB_COLS : new Set(["assignee"]);

  for (const [rawKey, rawVal] of Object.entries(csvRow)) {
    const key = rawKey.trim().toLowerCase();
    const val = rawVal?.trim();
    if (!val || !validCols.has(key)) continue;

    if (jsonbCols.has(key)) {
      mapped[key] = tryParseJson(val);
    } else if (key === "tenant_id" || key === "time_remaining") {
      const num = Number(val);
      mapped[key] = isNaN(num) ? null : num;
    } else {
      mapped[key] = val;
    }
  }

  return mapped;
}

export function getPreviewColumns(mode: ImportMode): string[] {
  if (mode === "clickup_tasks") {
    return ["task_id", "task_name", "status", "assignees", "priority", "list_name", "space_name", "due_date"];
  }
  return ["task_id", "task_name", "status", "unicorn_url", "tenant_id", "mb_level", "priority", "list"];
}
