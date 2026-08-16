/**
 * Allowlist discipline for service-role upserts into clickup_tasks /
 * clickup_tasksdb.
 *
 * The edge function uses the service-role key, so RLS does not apply.
 * Caller-supplied CSV rows must never be spread into the upsert — only
 * named columns from these lists. tenant_id is intentionally absent:
 * it is resolved server-side after the caller is verified, never taken
 * from the payload (same idea as pickAllowedUserColumns omitting
 * privilege columns).
 *
 * Column names match src/utils/clickup-import-mappings.ts minus
 * tenant_id and server-owned stamp fields (date_imported / imported_at).
 */

export const CLICKUP_TASKS_ALLOWED_COLUMNS = [
  "task_id",
  "task_custom_id",
  "task_name",
  "task_content",
  "status",
  "date_created",
  "date_created_text",
  "due_date",
  "due_date_text",
  "start_date",
  "start_date_text",
  "parent_id",
  "assignees",
  "tags",
  "priority",
  "list_name",
  "folder_name_path",
  "space_name",
  "time_estimated",
  "time_estimated_text",
  "checklists",
  "comments",
  "assigned_comments",
  "attachments",
  "time_spent",
  "time_spent_text",
  "rolled_up_time",
  "rolled_up_time_text",
] as const;

export const CLICKUP_TASKSDB_ALLOWED_COLUMNS = [
  "task_id",
  "task_custom_id",
  "task_name",
  "status",
  "task_content",
  "assignee",
  "priority",
  "latest_comment",
  "comment_count",
  "assigned_comment_count",
  "due_date",
  "start_date",
  "date_created",
  "date_updated",
  "date_closed",
  "date_done",
  "created_by",
  "space",
  "folder",
  "list",
  "tags",
  "time_logged",
  "time_logged_rolled_up",
  "time_estimate",
  "time_estimate_rolled_up",
  "time_in_status",
  "points_estimate",
  "points_estimate_rolled_up",
  "cricos_rereg_date",
  "mb_level",
  "mock_audit",
  "notes",
  "working_hours",
  "unicorn_url",
  "sharepoint_url",
  "date_of_last_contact",
  "time_remaining",
  "audit_date",
  "client_meeting_attendance",
  "date_of_last_systemscheck",
  "email_address",
  "infusionsoft_url",
  "phone",
  "rto_id",
  "registered_spr",
  "registration_date",
  "risk",
  "submission_date",
  "time_with_vivacity",
  "nothing_here",
  "on_hold_end_date",
  "on_hold_start_date",
  "re_reg_due_date",
  "linked_tasks",
  "linked_docs",
  "task_type",
] as const;

const BLOCKED_PAYLOAD_COLUMNS = [
  "tenant_id",
  "id",
  "date_imported",
  "imported_at",
] as const;

export function pickAllowedClickupColumns(
  row: Record<string, unknown>,
  allowed: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => allowed.includes(key)),
  );
}

export function findBlockedPayloadColumns(row: Record<string, unknown>): string[] {
  return BLOCKED_PAYLOAD_COLUMNS.filter((key) =>
    Object.prototype.hasOwnProperty.call(row, key),
  );
}
