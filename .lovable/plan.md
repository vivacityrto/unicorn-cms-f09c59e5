

# ClickUp Tasks and Comments on Tenant Detail Page

## Overview
Add a new section to the Tenant Detail page that displays ClickUp tasks and their related comments in a two-column layout, filtered by the current tenant.

## Layout
The new "ClickUp Activity" card will be placed in the main content area (left 3/4 column), below the existing TenantProgressTable. It will contain two side-by-side panels:

- **Left panel (Tasks)**: Table of ClickUp tasks for this tenant
- **Right panel (Comments)**: Comments for the currently selected task

Clicking a task row highlights it and loads its comments in the right panel.

## Data Sources

**Tasks** - Query `clickup_tasks_api` directly, filtered by `tenant_id`, selecting:
- `custom_id`, `name`, `status`, `date_created` (ms timestamp, formatted AU), `time_estimate`, `time_spent`, `creator_username`, `url` (as ClickUp link), `sharepoint_url` (as link)

**Comments** - Query `v_clickup_comments` view, filtered by `task_id` of the selected task, selecting:
- `comment_date` (formatted AU), `comment_by`, `comment_text`

## User Interaction
1. Page loads and fetches all ClickUp tasks for the tenant
2. Tasks displayed in a scrollable table
3. Clicking a task row selects it and fetches its comments
4. Comments display in the right panel with date, author, and text
5. If no task is selected, the right panel shows a prompt to select a task

## Technical Details

### New Component
**`src/components/tenant/TenantClickUpActivity.tsx`**
- Props: `tenantId: number`
- State: `tasks`, `selectedTaskId`, `comments`, `loadingTasks`, `loadingComments`
- On mount: fetch tasks from `clickup_tasks_api` where `tenant_id` matches
- On task select: fetch comments from `v_clickup_comments` where `task_id` matches
- Time fields (`date_created`, `time_estimate`, `time_spent`) are in milliseconds -- convert `date_created` with `formatDate()`, and format estimate/spent as hours/minutes
- `url` and `sharepoint_url` rendered as external link icons

### Integration into TenantDetail.tsx
- Import and render `<TenantClickUpActivity tenantId={parsedTenantId} />` after the `TenantProgressTable` block (around line 742)
- Only render for SuperAdmin roles (not client-facing)

### Formatting
- `date_created`: Convert from ms epoch to Date, then use `formatDate()` for dd/MM/yyyy
- `time_estimate` / `time_spent`: Convert from ms to "Xh Ym" format
- `comment_date`: Already a timestamp from the view, use `formatDate()`
- URLs: Render as small external link icons, not raw text

