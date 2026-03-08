

## Plan: Tasks Management + My Work + Today's Focus Refinements

### Summary of Requirements

1. **Today's Focus**: Should show the current user's action items (already done) plus **all client tasks** (from `tasks_tenants`) that are overdue or high-priority — not just the user's own.
2. **Tasks Management** (`/tasks-management`): Should show all `tasks_tenants` items (already does) plus all `client_action_items` and `ops_work_items` for **all users** (portfolio-wide). The "Create Task" here keeps Client as required. Add an "Assign to" field for Vivacity team members.
3. **My Work** (`/my-work`): Stays as-is (user's own items only). Add a "Create Task" button that creates an `ops_work_items` entry with optional client and an "Assign to" field for delegation.

### Changes

#### 1. Today's Focus — Add all-client overdue tasks (`useDashboardTriage.ts`)
- Add a new query for `tasks_tenants` where `completed = false` and `due_date < now` (overdue) or status is problematic.
- Remove the user-specific filter on action items — Today's Focus should aggregate across the portfolio for visibility.
- Add a FocusItem for "X overdue client tasks" linking to `/tasks-management`.

#### 2. Tasks Management — Add action items to the listing (`TasksManagement.tsx`)
- After fetching `tasks_tenants`, also fetch `client_action_items` and `ops_work_items` (all statuses except done/cancelled).
- Normalize both sources into the existing `Task` interface shape and merge into the task list.
- Add a "Source" badge (Client Task / Action / Ops) so users can distinguish.
- **Create Task dialog**: Add an "Assign to" dropdown using the existing `users` state (Vivacity team members). Store in `tasks_tenants.created_by` or `followers[0]` (since `tasks_tenants` has no `assigned_to` column — we'll use followers for now, or add a column).

#### 3. My Work — Add "Create Task" button (`MyWork.tsx`)
- Add a `+ Create Task` button in the header next to Refresh.
- Reuse the existing `CreateActionDialog` component (which already supports optional `tenantId`).
- Add an "Assign to" field to `CreateActionDialog` that sets `owner_user_uuid` on `ops_work_items` to the selected team member instead of the current user.

#### 4. CreateActionDialog — Add "Assign to" field
- Add a Vivacity team member dropdown (using `useVivacityTeamUsers`).
- When a team member is selected, set `owner_user_uuid` to that person's UUID instead of the current user.
- Default to current user (self-assignment).

### Technical Details

**Database**: `tasks_tenants` does not have an `assigned_to` column. For the Tasks Management "Create Task", we'll use the existing `followers` array as the assignment mechanism (first follower = assignee, matching existing pattern). No migration needed.

**CreateActionDialog changes**: Add `assigneeUserId` state, default to `profile.user_uuid`. Render a Select dropdown of Vivacity team users. Pass selected value to `owner_user_uuid` on insert.

**TasksManagement data merge**: Fetch `ops_work_items` and `client_action_items` alongside `tasks_tenants`. Map them into a unified shape with a `source` discriminator. Update stats cards to count across all sources. Update filters to work across sources.

### Files to Edit
- `src/hooks/useDashboardTriage.ts` — add `tasks_tenants` overdue query to Today's Focus
- `src/pages/TasksManagement.tsx` — merge action items into listing, add assign-to in create dialog
- `src/pages/MyWork.tsx` — add Create Task button using CreateActionDialog
- `src/components/client/CreateActionDialog.tsx` — add "Assign to" dropdown

