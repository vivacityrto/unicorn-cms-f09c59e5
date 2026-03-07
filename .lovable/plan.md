## Completed: Create `dd_stage_types` Lookup Table

Created `dd_stage_types` table with 6 types (onboarding, delivery, documentation, support, monitoring, offboarding) including `is_milestone` column for progress metrics. Replaced all 7 hardcoded `STAGE_TYPE_OPTIONS` arrays with the `useStageTypeOptions` hook. Updated progress logic to use `is_milestone` fallback and added `monitoring` to auto-default logic.

## Completed: Create `dd_priority` and `dd_action_status` Lookup Tables

Created `dd_priority` (low, normal, medium, high, urgent) and `dd_action_status` (open, in_progress, blocked, waiting_client, done, cancelled, todo) lookup tables. Dropped 4 conflicting CHECK constraints on `client_action_items` and replaced with a validation trigger (`trg_validate_action_item_priority_status`). Updated `rpc_create_action_item` to validate against `dd_priority` table and default to `'medium'`. Created `useActionPriorityOptions` and `useActionStatusOptions` hooks with module-level caching. Replaced all hardcoded priority/status configs in `ClientActionItemsTab`, `PackageNotesSection`, `useClientManagementData`, and `useClientWorkboard`. Added `'normal'` and `'open'` to `ItemPriority` and `ItemStatus` types.
