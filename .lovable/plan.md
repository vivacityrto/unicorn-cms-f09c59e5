## Completed: Create `dd_stage_types` Lookup Table

Created `dd_stage_types` table with 6 types (onboarding, delivery, documentation, support, monitoring, offboarding) including `is_milestone` column for progress metrics. Replaced all 7 hardcoded `STAGE_TYPE_OPTIONS` arrays with the `useStageTypeOptions` hook. Updated progress logic to use `is_milestone` fallback and added `monitoring` to auto-default logic.

## Completed: Create `dd_priority` and `dd_action_status` Lookup Tables

Created `dd_priority` (low, normal, medium, high, urgent) and `dd_action_status` (open, in_progress, blocked, waiting_client, done, cancelled, todo) lookup tables. Dropped 4 conflicting CHECK constraints on `client_action_items` and replaced with a validation trigger (`trg_validate_action_item_priority_status`). Updated `rpc_create_action_item` to validate against `dd_priority` table and default to `'medium'`. Created `useActionPriorityOptions` and `useActionStatusOptions` hooks with module-level caching. Replaced all hardcoded priority/status configs in `ClientActionItemsTab`, `PackageNotesSection`, `useClientManagementData`, and `useClientWorkboard`. Added `'normal'` and `'open'` to `ItemPriority` and `ItemStatus` types.

## Completed: Staff Task Assignment + `completed_by` Tracking

Added `completed_by` UUID column to `staff_task_instances`. Created `TaskAssigneeButton` component (silhouette icon when unassigned, avatar when assigned, popover for team member selection with unassign option). Updated `useStaffTaskInstances` hook: on status → Completed/Core Complete sets `completed_by` to current user; on revert clears it; on assign auto-creates a linked action item via `rpc_create_action_item` with `source: 'task_assignment'`. Integrated `TaskAssigneeButton` into `StageStaffTasks.tsx` between task info and notes popover. Disabled for N/A tasks and finished stages.

## Completed: Fix Documents Tab Error + Risk Note Auto-Open

Fixed `validate_document_readiness` RPC to use `document_fields` + `dd_fields` tables instead of the dropped `merge_fields` column. Now validates required fields against `v_tenant_merge_fields` with real value checks per tenant. Also wired `ClientStructuredNotesTab` to consume `initNote`/`noteTitle` URL search params so risk level changes auto-open a pre-filled note dialog with type "risk".

## Completed: Tasks Management + My Work + Today's Focus Refinements

1. **Today's Focus**: Added overdue `tasks_tenants` count (portfolio-wide) as a focus item linking to `/tasks-management`. Existing user action items remain.
2. **Tasks Management**: Merged `client_action_items` and `ops_work_items` into the task listing with source badges (Client Task / Action / Ops). Added "Assign To" dropdown in the create dialog using Vivacity team members. Assignee is added to followers array. Edit/delete actions only available for native `tasks_tenants` items.
3. **My Work**: Added "Create Task" button using `CreateActionDialog` with optional client association.
4. **CreateActionDialog**: Added "Assign to" dropdown defaulting to current user, sets `owner_user_uuid` on `ops_work_items`.
