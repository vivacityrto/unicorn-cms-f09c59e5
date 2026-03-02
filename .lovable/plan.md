

## Add Item Counts to Stage Tab Labels

### Goal
Display a count badge next to each tab label (Staff Tasks, Client Tasks, Documents, Emails) so users can see at a glance how many items exist per section without opening each tab.

### Approach
Create a lightweight hook (`useStageCounts`) that fetches the four counts in parallel for a given `stageInstanceId`. This avoids duplicating the full data-fetching logic from each section's hook and keeps the tab header rendering fast.

### Changes

**1. New hook: `src/hooks/useStageCounts.ts`**

A simple hook that runs four `SELECT count(*)` queries in parallel against `staff_task_instances`, `client_task_instances`, `document_instances`, and `email_instances`, all filtered by `stageinstance_id`. Returns `{ staffTasks, clientTasks, documents, emails, loading }`.

**2. Update: `src/components/client/PackageStagesManager.tsx`**

- Import and call `useStageCounts(stage.id)` inside `renderStageRow`.
- Since `renderStageRow` is currently a function (not a component), it will be extracted into a small `StageRow` component so hooks can be used inside it.
- Append a count badge (e.g., `(3)`) next to each tab trigger label. When loading, show nothing or a subtle placeholder.

### Technical Detail

The count query approach (rather than reusing the full hooks) ensures:
- No duplicate data fetching -- the full data is only loaded when the tab is actually opened.
- Counts load quickly since they are simple aggregation queries.
- The existing child components (`StageStaffTasks`, `StageClientTasks`, etc.) remain unchanged.

