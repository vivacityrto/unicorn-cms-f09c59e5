

## Fix `publish_stage_version` RPC Function

### Problem
The function references wrong tables and columns throughout. All `stage_*` prefixed tables have 0 rows — real data lives in `staff_tasks`, `client_tasks`, and `emails`.

### Issues to Fix

| # | Current (broken) | Correct |
|---|-----------------|---------|
| 1 | Stage from `documents_stages` | `stages` |
| 2 | `v_stage.title` | `v_stage.name` |
| 3 | Team tasks from `stage_team_tasks` | `staff_tasks` |
| 4 | `sort_order` column | `order_number` |
| 5 | Client tasks from `stage_client_tasks` | `client_tasks` |
| 6 | Emails from `stage_emails` joined with `email_templates` | `emails` (standalone, no join needed) |
| 7 | `et.name` (doesn't exist) | `emails.name` directly |
| 8 | No instance updates | Need to update `*_instances` tables |

### Instance Update Logic

After creating the version snapshot, the function should update active instances for all non-complete packages that include this stage:

1. **Find active stage instances**: Query `stage_instances` joined with `package_instances` where `is_complete = false` and `stage_id = p_stage_id`
2. **For each active stage instance**, sync child instances:
   - **staff_task_instances**: Insert new tasks from `staff_tasks` that don't already have a corresponding instance (matched by `stafftask_id`). Do not remove or modify existing instances.
   - **client_task_instances**: Insert new tasks from `client_tasks` not yet instantiated (matched by `clienttask_id`).
   - **email_instances**: Insert new emails from `emails` not yet instantiated (matched by `email_id`).

This is an additive-only approach — new template items get provisioned, existing instances are never deleted or overwritten.

### Migration

Single `CREATE OR REPLACE FUNCTION` migration that:

1. Reads stage from `public.stages` (using `v_stage.name`, `v_stage.stage_type`, `v_stage.ai_hint`, `v_stage.is_certified`, `v_stage.certified_notes`)
2. Snapshots team tasks from `staff_tasks` with columns: `id`, `name`, `description`, `order_number`, `is_core`, `is_key_event`, `due_date_offset`, `is_recurring`
3. Snapshots client tasks from `client_tasks` with columns: `id`, `name`, `description`, `instructions`, `sort_order`, `due_date_offset`, `is_mandatory`
4. Snapshots emails from `emails` directly (no join): `id`, `name`, `subject`, `description`, `order_number`, `is_core`
5. Documents from `stage_documents` joined with `documents` — unchanged (already correct)
6. Inserts the version row and audit event (unchanged logic)
7. **New**: Loops through active stage instances and inserts missing `staff_task_instances`, `client_task_instances`, and `email_instances`

### Files Changed
- **1 database migration** — replaces the `publish_stage_version` function

