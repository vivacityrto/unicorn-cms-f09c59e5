

## Plan: Fix Action Item Title/Description + Add "View Task" Link

### Issues Identified

1. **Title shows literal word "Package"** — `StaffTaskActionMenu` only fetches `packageName` when `type === 'email'` (line 75). For non-email tasks, `packageName` stays empty, so the title falls back to just the task name.

2. **Description format wrong** — Currently says `"Task delegated from Package by: Name. snippet"`. Should say `"Task delegated by: Name"` then a line break, then the snippet.

3. **No `staff_task_instance_id` stored on the action item** — The `client_action_items` table has `related_entity_type` and `related_entity_id` columns, and `rpc_create_action_item` accepts `p_related_entity_type` and `p_related_entity_id`. These are not being populated.

4. **No "View Task" from Action Item dropdown** — The action dots on `ClientActionItemsTab` have Edit/Status/Delete but no way to navigate to the source task.

---

### Changes

#### 1. Fix `StaffTaskActionMenu.tsx` — Fetch package/stage names for ALL task types
- Remove the `if (type !== 'email' || !tenantId) return;` guard on the `useEffect` that fetches package and stage names. Change it to `if (!tenantId || !stageInstanceId) return;` so the data is fetched for all task types (not just email).
- This ensures `packageName` and `stageName` are populated when `CreateActionDialog` opens.

#### 2. Fix `CreateActionDialog.tsx` — Update description format
- Change description from `"Task delegated from Package by: Name. snippet"` to:
  ```
  Task delegated by: Name
  snippet
  ```
  (newline separated, no "from Package")

#### 3. Store `staff_task_instance_id` on action items

- **`CreateActionDialog`**: Add a `staffTaskInstanceId` prop. When inserting into `ops_work_items`, also pass `linked_compliance_task_instance_id` (or use `related_entity_id`). Since `CreateActionDialog` inserts into `ops_work_items` (not `client_action_items`), and `ops_work_items` has `linked_compliance_task_instance_id` — we can repurpose that or store the task instance ID in the audit log details.

- **`useStaffTaskInstances.ts`**: When calling `rpc_create_action_item` on assignment, pass `p_related_entity_type: 'staff_task_instance'` and `p_related_entity_id: taskId.toString()`.

- **`StaffTaskActionMenu`**: Pass `taskId` (the staff_task_instance id) through to `CreateActionDialog` — already done. But we need `CreateActionDialog` to also call `rpc_create_action_item` (into `client_action_items`) instead of/in addition to `ops_work_items`, OR store the reference. The simplest path: pass `p_related_entity_type` and `p_related_entity_id` when creating via `rpc_create_action_item` in the auto-assignment flow.

Actually, looking more carefully: `CreateActionDialog` inserts into `ops_work_items`, while the Action Items tab reads from `client_action_items`. These are two different tables. The "View Task" feature is needed on the `ClientActionItemsTab` dropdown, which reads `client_action_items`. The auto-assignment in `useStaffTaskInstances` calls `rpc_create_action_item` which inserts into `client_action_items`.

So:
- **`useStaffTaskInstances.ts`**: Pass `p_related_entity_type: 'staff_task_instance'` and `p_related_entity_id: taskId.toString()` when calling `rpc_create_action_item`. Also fix the title to use `Package > Stage > Task` format (need to resolve package and stage names).
- **`CreateActionDialog`**: This inserts into `ops_work_items` — separate concern, keep as-is but fix the title/description format.

#### 4. Add "View Task" to Action Items dropdown in `ClientActionItemsTab.tsx`
- When an action item has `related_entity_type === 'staff_task_instance'` and `related_entity_id` is set, show a "View Task" menu item.
- Clicking it needs to navigate to the package's stage accordion and expand the right stage. Since the app is on `/tenant/{id}` and packages are shown in an accordion/tab structure, we need to either:
  - Scroll/open the correct package and stage (complex in-page navigation), or
  - Use a URL hash/query param approach like `/tenant/{id}?openTask={taskInstanceId}`

- Simplest approach: Look up the `staff_task_instance` → `stageinstance_id` → `packageinstance_id` chain, then programmatically switch to the Packages tab and expand the correct package and stage. This requires a shared state or URL param approach.

- Practical approach: Use `react-router` search params. Add `?tab=packages&packageInstance={id}&stageInstance={id}` to the URL. The `ClientPackagesTab` and `PackageStagesManager` would need to read these params and auto-expand.

### Technical Detail

**Files to modify:**
1. `src/components/client/StaffTaskActionMenu.tsx` — Remove email-only guard on package/stage name fetch
2. `src/components/client/CreateActionDialog.tsx` — Fix description format (newline, no "from Package")
3. `src/hooks/useStaffTaskInstances.ts` — Pass `related_entity_type`/`related_entity_id` + fix title format with package/stage names
4. `src/components/client/ClientActionItemsTab.tsx` — Add "View Task" dropdown item that navigates via URL params
5. `src/components/client/ClientPackagesTab.tsx` — Read URL params to auto-expand package/stage
6. `src/components/client/PackageStagesManager.tsx` — Read URL params to auto-expand stage accordion

**No database migration needed** — `related_entity_type` and `related_entity_id` columns already exist on `client_action_items`.

