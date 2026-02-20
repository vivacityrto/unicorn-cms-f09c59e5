
## Fix: ClickUp Tasks Not Rendering — Root Cause & Solution

### Confirmed Root Cause

The database query as a superuser confirms data **does exist** for tenant 7449 in `v_clickup_tasks`. The component query is also correct. The problem is purely a database access control issue:

- Both `clickup_tasks` and `clickup_tasksdb` have **Row Level Security (RLS) enabled**
- Neither table has **any SELECT policy** defined for the `authenticated` role
- When the Supabase JS client queries `v_clickup_tasks` (which JOINs both tables), Postgres enforces RLS on the underlying tables and silently returns zero rows — no error, just empty results
- The previous migration only granted SELECT on the view itself, but did not address RLS on the base tables the view reads from

This explains every symptom: no error shown in the UI, no console error thrown, just an empty list.

---

### The Fix — One Migration

A single database migration that adds SELECT policies to both base tables, scoped correctly to Vivacity staff only (since ClickUp tasks in the admin Notes tab is a SuperAdmin/staff-only feature).

```sql
-- Allow Vivacity staff to read ClickUp tasks
CREATE POLICY "vivacity_staff_select_clickup_tasks"
  ON public.clickup_tasks
  FOR SELECT
  TO authenticated
  USING (public.is_vivacity_staff(auth.uid()));

-- Allow Vivacity staff to read ClickUp tasks DB records
CREATE POLICY "vivacity_staff_select_clickup_tasksdb"
  ON public.clickup_tasksdb
  FOR SELECT
  TO authenticated
  USING (public.is_vivacity_staff(auth.uid()));

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
```

The `is_vivacity_staff()` function already exists in the database (it is part of the established RLS helper library). It checks that the user has a Super Admin, Team Leader, or Team Member role — exactly right for this admin-side feature. No code changes are needed; only the migration is required.

---

### Why This Is Correct

- Previous attempts granted permissions on the view but not the base tables — Postgres enforces RLS at the table level regardless of view-level grants
- Scoping to `is_vivacity_staff()` is correct: ClickUp task data is internal Vivacity operational data and should not be visible to client Admin or General User roles
- No component code needs to change — the query is already filtering by `tenant_id_db = tenantId` correctly and data exists for tenant 7449

---

### Technical Detail

```text
API Request (authenticated role)
        │
        ▼
v_clickup_tasks (view, SELECT granted) ← previous migration handled this
        │
        ├── JOIN clickup_tasks        ← RLS ON, no SELECT policy → returns 0 rows
        └── JOIN clickup_tasksdb     ← RLS ON, no SELECT policy → returns 0 rows
```

After the migration:

```text
API Request (authenticated role, is_vivacity_staff = true)
        │
        ▼
v_clickup_tasks (view, SELECT granted)
        │
        ├── JOIN clickup_tasks        ← RLS policy allows → returns rows
        └── JOIN clickup_tasksdb     ← RLS policy allows → returns rows
```

---

### Files Changed

- **Database only** — one migration SQL file
- No TypeScript or component changes required
