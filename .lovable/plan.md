# Hide archived client tasks in the client portal

## Goal

Apply `is_archived = false` as the default filter on every client-portal query against `client_task_instances`. On `/client/tasks`, add a "Show archived" toggle (default OFF) that drops the filter when ON and visually distinguishes archived rows. No RLS or schema changes.

## Reference audit (verified)

Complete client-portal consumers of `client_task_instances`:

1. `src/hooks/useClientAllTasks.ts` — Tasks page + AttentionPanel
2. `src/hooks/useClientTaskInstances.ts` — Per-stage client task list
3. `src/hooks/useClientPackageInstances.tsx` — Package/stage detail
4. `src/hooks/useStageCounts.ts` — Stage tile counters

Excluded (staff-only, intentionally unchanged): `Unicorn1ImportDialog.tsx`, `tenant/CloseClientModal.tsx`, `client/PackageDataManager.tsx` (admin bulk-delete despite folder), edge functions.

## Changes

### 1. `src/hooks/useClientAllTasks.ts`

- Accept `includeArchived: boolean = false` argument.
- Add `is_archived, archived_at` to the `select(...)` on `client_task_instances`.
- When `!includeArchived`, chain `.eq('is_archived', false)`.
- Add `includeArchived` to `queryKey` so toggling refetches without reload.
- Extend `ClientAllTask` with `isArchived: boolean` and `archivedAt: string | null`; map from row.

### 2. `src/pages/ClientTasksPage.tsx`

- Local `useState<boolean>` for `showArchived`; pass to `useClientAllTasks(showArchived)`.
- Add a `Switch` (shadcn `@/components/ui/switch`) labelled **"Show archived"** in a flex row directly **above** the four counter pills, right-aligned with muted helper text ("Hidden by default").
- Pill counters (All / Overdue / Due Soon / Completed) derive from the hook's `tasks` array, so they recount automatically.
- In `TaskRow`, when `task.isArchived`:
  - Add `opacity-60` to the `<tr>` and `line-through` to the task name span.
  - In Status column, render `<Badge variant="outline" className="ml-1.5">Archived</Badge>` next to the existing status badge.

### 3. `src/hooks/useClientTaskInstances.ts`

- Add `.eq('is_archived', false)` to the `select` on `client_task_instances` (line ~37). Archived rows never appear in the per-stage view; no toggle.

### 4. `src/hooks/useClientPackageInstances.tsx`

- Add `.eq('is_archived', false)` to the parallel `client_task_instances` `select` around line 273-276.
- The `updateClientTaskStatus` mutation (line 477) targets a known id and needs no filter.

### 5. `src/hooks/useStageCounts.ts`

- Add `.eq('is_archived', false)` to the `client_task_instances` count query so stage tiles exclude archived instances.

### 6. `src/components/client/AttentionPanel.tsx`

- No change. It consumes `useClientAllTasks()` and inherits the default-hidden behaviour.

## Acceptance

- AHMRC `/client/tasks` shows ~13 tasks by default; pill counters reflect the subset.
- Toggling "Show archived" ON instantly re-renders to ~59 tasks (React Query refetch on key change).
- Archived rows are dimmed with strikethrough title and "Archived" badge in Status.
- Stage tiles in client portal package view exclude archived tasks from counts.
- No RLS, no migrations.
