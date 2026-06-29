## Plan: User-private daily notes sidebar on Tasks Management

### 1. Database migration
Create `public.user_daily_notes`:
- `id uuid pk default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `note_date date not null`
- `content text not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- Index on `(user_id, note_date)`
- `updated_at` trigger using existing `update_updated_at_column()` helper
- GRANTs: `SELECT, INSERT, UPDATE, DELETE` to `authenticated`; `ALL` to `service_role` (no `anon`)
- Enable RLS; four policies (SELECT/INSERT/UPDATE/DELETE) all scoped to `auth.uid() = user_id`

### 2. New component — `src/components/TaskNotesSidebar.tsx`
Props: `{ isOpen, onClose, userId }`. Persistent right-side panel (fixed width ~360px, full-height, neutral gray bg, border-l).
- Top: shadcn `Calendar` (mode="single"), defaults to today; selection drives the active date
- Header row: "Notes for {Day, DD Month YYYY}" (date-fns `EEEE, dd MMMM yyyy`) + `+ Add Note` button (bg `#7130A0`, white text)
- Notes list: query `user_daily_notes` where `user_id = userId` and `note_date = selectedDate`, order `created_at asc`
- Each note: time `hh:mm a`, content below, `MoreHorizontal` dropdown (Edit / Delete)
  - Edit → inline textarea + Save/Cancel (UPDATE row, refresh)
  - Delete → DELETE row + sonner toast
- Add: inline textarea at bottom of list with Save/Cancel (INSERT with `note_date = selectedDate`)
- Close `X` button top-right calls `onClose`
- React Query for fetch + invalidation; sonner for toasts

### 3. `src/pages/TasksManagement.tsx` changes (additive only)
- Add `import { NotebookPen } from 'lucide-react'` and `TaskNotesSidebar`
- Add state `const [isNotesOpen, setIsNotesOpen] = useState(false)`
- Add a Notes toggle button in the header next to `+ Create Task` (icon + "Notes")
- Wrap the existing return root in `<div className="flex flex-row w-full">…<main className="flex-1 min-w-0">{existing}</main>{isNotesOpen && user?.id && <TaskNotesSidebar isOpen onClose={() => setIsNotesOpen(false)} userId={user.id} />}</div>`
- Nothing else in the file is modified — Create Task dialog, details Sheet, stat cards, filters, table, pagination, uploads, and all existing queries remain untouched

### Risk / notes
- Migration is isolated (new table, no FK churn beyond auth.users CASCADE)
- Sidebar is additive; only the outer wrapper of TasksManagement changes
- `user?.id` from existing `useAuth` is used; sidebar only renders when present
