

## Updated Plan: Create `dd_priority` and `dd_action_status` Lookup Tables + Fix Constraint Conflicts

### Only Change from Previous Plan

Add `normal` to the `dd_priority` table. The full priority list is now:

| code | value | label | sort_order | is_active |
|------|-------|-------|------------|-----------|
| 1 | low | Low | 1 | true |
| 2 | normal | Normal | 2 | true |
| 3 | medium | Medium | 3 | true |
| 4 | high | High | 4 | true |
| 5 | urgent | Urgent | 5 | true |

Default priority remains `'medium'` for new actions. Existing rows with `priority = 'normal'` stay as-is (now a valid value).

Everything else from the previous plan remains unchanged:
- Create `dd_priority` (5 rows) and `dd_action_status` (7 rows) lookup tables
- Drop conflicting CHECK constraints on `client_action_items`
- Update `rpc_create_action_item` to validate against the new tables
- Create `useActionPriorityOptions` and `useActionStatusOptions` hooks
- Replace all hardcoded priority/status configs in `ClientActionItemsTab`, `PackageNotesSection`, `useClientManagementData`, and `useClientWorkboard`
- Then proceed with `TaskAssigneeButton` component, `completed_by` column, and auto-action creation on task assignment

