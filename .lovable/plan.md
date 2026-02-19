
## Add ClickUp Tasks to the Admin Notes Tab

### What the User Wants

The screenshot shows the admin-side **Notes tab** on the tenant detail page (`/tenant/7530`), which renders `ClientStructuredNotesTab`. The "All Notes" filter dropdown (top-right of the Structured Notes card) currently has:
- All Notes
- Client Notes
- Package Notes

The user wants a **"ClickUp Tasks"** option added to that dropdown. When selected, instead of filtering notes, it replaces the notes list with a ClickUp tasks panel showing: `task_name`, `task_content`, `date_created` (formatted from `date_created_ts`), and `comments`.

### File Changed

**`src/components/client/ClientStructuredNotesTab.tsx`** — single file, no new files required.

---

### What Changes Inside the Component

#### 1. Add ClickUp interface and state

Add a `ClickUpTask` interface and three new state variables:

```typescript
interface ClickUpTask {
  id: string;
  task_name: string | null;
  task_content: string | null;
  date_created_ts: string | null;
  date_created_text: string | null;
  comments: unknown;
  status: string | null;
  list_name: string | null;
}

const [clickupTasks, setClickupTasks] = useState<ClickUpTask[]>([]);
const [clickupLoading, setClickupLoading] = useState(false);
const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
```

#### 2. Add fetch function + trigger

A `fetchClickupTasks` function that queries `v_clickup_tasks` filtered by `tenant_id_db = tenantId`, ordered by `date_created_text` descending. A `useEffect` fires it when `parentTypeFilter === 'clickup'`.

#### 3. Extend the dropdown

Change `parentTypeFilter` type handling to include `'clickup'`. Add a visual separator and new item in the Select:

```
All Notes        ← existing
Client Notes     ← existing
Package Notes    ← existing
─────────────── separator
ClickUp Tasks    ← new, with ListTodo icon
```

The filter logic already gates on `parentTypeFilter !== 'clickup'` so regular notes won't be affected.

#### 4. ClickUp tasks panel

When `parentTypeFilter === 'clickup'`, instead of the notes `ScrollArea`, render a ClickUp tasks panel inside the same `CardContent`:

- **Loading state**: spinner with "Loading ClickUp tasks..."
- **Empty state**: message explaining no tasks are linked to this tenant
- **Task list**: each task in a card-style row showing:
  - Task name (bold) + List name badge
  - `date_created_ts` formatted as `dd MMM yyyy` using `date-fns`
  - Status badge
  - Content snippet (2-line clamp)
  - Chevron to expand and show full content + comments
  - **Comments section** (expanded): iterates the `comments` JSON array showing commenter name and comment text

#### 5. Import additions

- `ListTodo` and `ChevronDown`/`ChevronUp` from `lucide-react`
- `SelectSeparator` from `@/components/ui/select`

---

### Behaviour Details

- Selecting "ClickUp Tasks" does NOT affect the Add Note button (it stays visible — ClickUp tasks are read-only, no add action is relevant)
- The count badge on "Structured Notes" still shows internal notes count when `clickup` is selected (it naturally filters to 0 but the heading badge will show ClickUp task count separately in the panel header)
- The Tags filter Popover is hidden when ClickUp mode is active (it has no meaning for ClickUp data)
- The "Add Note" button remains visible at all times (ClickUp panel is read-only, adding notes still makes sense)

---

### No Schema Changes Required

The `v_clickup_tasks` view already exists with the required columns: `id`, `task_name`, `task_content`, `date_created_ts`, `date_created_text`, `comments`, `status`, `list_name`, `tenant_id_db`.
