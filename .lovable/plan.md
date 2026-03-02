

## Staff Task Refinements: Email Actions, Core Toggle, and Dynamic Prefixes

### Overview
Three sets of changes to staff task rows: (1) refined email actions with stage email selection, (2) is_core toggle, and (3) dynamic prefix badge system for any `TAG:` pattern in task names.

---

### 1. Email Task Actions -- "Internal CSC" and "External Primary" with Email Selection

**How it works:**
- EMAIL-type tasks get two actions in the dropdown: **"Send Internal CSC"** (sends to the assigned CSC) and **"Send External Primary"** (sends to the tenant's primary contact).
- The action menu also lists the stage's email instances (fetched via `useStageEmails`) as selectable items under a "Stage Emails" sub-section. Clicking one opens the `ComposeEmailDialog` pre-filled with that email's subject, body, and recipient.
- If the EMAIL task name includes the email subject after the prefix (e.g., `EMAIL: New Client Assigned`), the system tries to auto-match it to a stage email by subject. If matched, a "Preview & Send" action appears directly.
- After a successful send (via `ComposeEmailDialog`'s `onSent` callback), a confirmation toast asks "Mark task as completed?" with a "Yes" action button. Clicking it calls `updateTaskStatus(taskId, 2)`.
- **No "Mark as Sent" or "Mark Complete"** in EMAIL actions -- completion is prompted only after sending.

**Technical changes:**

- **`src/utils/staffTaskType.ts`**: Update `getActionsForType('email')` to return `send_internal_csc` and `send_external_primary` (remove mark_sent, mark_complete).
- **`src/components/client/StaffTaskActionMenu.tsx`**:
  - Accept new props: `stageInstanceId`, `onMarkComplete`, `stageEmails` (array of stage emails).
  - For EMAIL tasks, render a sub-section listing available stage emails by subject.
  - Clicking "Send Internal CSC" or "Send External Primary" opens `ComposeEmailDialog` with the appropriate recipient (CSC email or primary contact).
  - Clicking a stage email opens `ComposeEmailDialog` pre-filled with that email's content.
  - On successful send, show toast with "Mark as completed?" action button.
- **`src/components/client/StageStaffTasks.tsx`**:
  - Fetch stage emails via `useStageEmails({ stageInstanceId })` once and pass them to each `StaffTaskActionMenu`.
  - Pass `onMarkComplete` callback that calls `updateTaskStatus(task.id, 2)`.

---

### 2. Core Task Toggle (is_core)

- Add a small circular checkbox/toggle on each staff task row.
- On hover, a tooltip displays "Core Task".
- Toggling it updates `staff_task_instances.is_core` in Supabase and logs to `client_audit_log`.

**Technical changes:**

- **`src/components/client/StageStaffTasks.tsx`**: Add a `Checkbox` (styled as circle) with a `Tooltip` wrapping it. On change, call `updateTaskCore`.
- **`src/hooks/useStaffTaskInstances.ts`**: Add `updateTaskCore(taskId: number, isCore: boolean)` function that updates the `is_core` column and logs the audit entry.

---

### 3. Dynamic Prefix Badge System

Currently only `EMAIL:`, `ADMIN:`, `OM:` are hardcoded. The system will now detect **any** `UPPERCASE_WORD:` prefix at the start of a task name.

- Known prefixes (`EMAIL`, `ADMIN`, `OM`) keep their specific colours and actions.
- New known prefixes: `CSC:` (green badge), `POST:` (orange badge).
- Any unknown `TAG:` prefix gets a neutral grey badge with just "Mark Complete" as its action.
- If a prefix appears in the task description (not just the name), it also generates a badge.

**Technical changes:**

- **`src/utils/staffTaskType.ts`**:
  - Change `parseTaskType` to use regex `/^([A-Z]+):\s*/` to detect any prefix.
  - Expand colour/style mappings for known prefixes, default to neutral grey for unknown.
  - `getActionsForType`: Only `email` gets custom actions. All others default to `[{ label: 'Mark Complete', key: 'mark_complete' }]`.

---

### Files to Create/Modify

| File | Action | What Changes |
|------|--------|-------------|
| `src/utils/staffTaskType.ts` | Modify | Regex-based prefix detection, updated email actions, new prefix colours |
| `src/components/client/StaffTaskActionMenu.tsx` | Modify | Email selection from stage emails, ComposeEmailDialog integration, post-send completion prompt |
| `src/components/client/StageStaffTasks.tsx` | Modify | Fetch stage emails, pass to action menu, add is_core toggle with tooltip |
| `src/hooks/useStaffTaskInstances.ts` | Modify | Add `updateTaskCore` function |

No database changes required.

