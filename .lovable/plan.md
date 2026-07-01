## Tasks Management — four improvements

### 1. Priority not showing in table (`src/pages/TasksManagement.tsx`)
- Add `priority,\n          milestones` to the `tasks_tenants` SELECT list (~line 156-170) so both fields come back.
- Change line 268 from `priority: null,` to `priority: task.priority,` and add `milestones: task.milestones ?? null,` on the mapped object so the sidebar can read them.

### 2. Milestones section in task detail sidebar (`src/pages/TasksManagement.tsx`)
- In the sidebar (after the Followers block ~line 1653, before Attachments ~line 1655), add a new conditional block rendered only when `selectedTask.milestones?.length > 0`:
  - `<Separator />`
  - Label row ("Milestones") matching the styling of Followers/Status labels (uppercase, muted, small icon — reuse `CheckCircle2` or `ListChecks` if already imported, otherwise `CheckCircle2`).
  - Map each milestone to a row with a read-only shadcn `Checkbox` (`checked={m.completed}` `disabled`) and the milestone text next to it.
- Milestones shape follows the existing edit dialog usage (`{ text, completed }`).

### 3. Formatting toolbar in notes editor (`src/components/TaskNotesSidebar.tsx`)
- Add a small toolbar above the "add note" `Textarea` (~line 224) with two `Button variant="outline" size="sm"` controls: **Bullets** and **Numbering**.
- On click, mutate `newContent` by:
  - Bullets: split current value by `\n`, prefix each non-empty line with `- ` (skip if already prefixed), rejoin. If value is empty, insert `- `.
  - Numbering: same pattern but prefix `1. `, `2. `, … incrementing per non-empty line.
- Also add the same toolbar for the in-place edit textarea (the block using `editingContent` above line 200) so editing has parity.
- Keep persistence as-is (plain text markdown).
- Display (line 214-216): keep as `whitespace-pre-wrap` plain text. Markdown-style dashes/numbers already render naturally as leading characters — no renderer dependency added to keep scope minimal.

### 4. Client field optional in Create Task form (`src/pages/TasksManagement.tsx`)
- Line 773: change `Client *` → `Client`.
- Line 918 `disabled=` condition: drop `!formData.tenant_id`, keep `!formData.task_name || !formData.due_date`.
- Line 833 guard inside the Save handler: drop `!formData.tenant_id` from the early return; wrap the insert `tenant_id` value so it becomes `formData.tenant_id ? parseInt(formData.tenant_id) : null` (the column already accepts null; unset package_id similarly).

### Out of scope (explicitly untouched)
- Table columns, stat cards, real-time subscriptions, edit dialog validation, priority column display logic.

### Verification
- Typecheck.
- Manual: create a task without a client → succeeds; create one with priority → priority badge appears in table; open a task with milestones → sidebar shows read-only checkboxes; click Bullets/Numbering in notes → lines gain prefix.
