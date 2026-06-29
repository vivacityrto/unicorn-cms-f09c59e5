## Plan: Add Priority & Milestones to Task dialogs

### 1. Migration
Add two nullable columns to `public.tasks_tenants`:
```sql
ALTER TABLE public.tasks_tenants
  ADD COLUMN IF NOT EXISTS priority text,
  ADD COLUMN IF NOT EXISTS milestones jsonb;
```

### 2. Edits to `src/pages/TasksManagement.tsx` (only file touched)

- **Imports**: ensure `Checkbox` from `@/components/ui/checkbox` is imported.
- **Task interface**: add `milestones?: Array<{ id: string; text: string; completed: boolean }> | null;` (priority already typed).
- **State**:
  - Add `priority: ""` to `formData` initial state.
  - Add `const [milestones, setMilestones] = useState<Array<{ id: string; text: string; completed: boolean }>>([]);`
- **Create dialog**:
  - Insert Priority `<Select>` (Urgent / High / Normal / Low) directly after the Status field.
  - Insert Milestones section after Priority, before Followers — list of `Checkbox` + `Input` + remove button, plus "+ Add Milestone" button using `crypto.randomUUID()`.
  - On dialog close (`onOpenChange`), reset `milestones` to `[]` and `formData.priority` to `""` alongside existing resets.
  - Include `priority: formData.priority || null` and `milestones: milestones.length > 0 ? milestones : null` in the insert payload.
- **Edit dialog**:
  - Same Priority + Milestones UI.
  - When `editingTask` is loaded, populate `formData.priority` and `setMilestones(editingTask.milestones || [])`.
  - On close, reset both.
  - Include both fields in the update payload.

### 3. Out of scope (untouched)
Notes sidebar, details Sheet, stat cards, search/filter/column toggle, table + priority badge display, pagination, uploads, followers logic, existing status Select, all other queries.
