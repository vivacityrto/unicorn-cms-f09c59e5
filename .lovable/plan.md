

# Stabilise Tenant Linkage Layer and Wire Task Mapping

## Current State

The foundational tables exist but are incomplete:

- **`task_assignments`**: Missing `tenant_scope_start_at` column; RLS is disabled.
- **`tenant_task_status`**: Correct schema, RLS enabled -- no changes needed.
- **`task_tenant_map`**: Correct schema, RLS enabled -- no changes needed.
- **`v_tenant_activity_summary`**: Working correctly (401 tenants).
- **`v_tenant_tasks`**: Exists but only reads from `task_tenant_map` -- missing the expansion join.
- **`v_tenant_task_requirements`**: Does not exist.
- **`clickup_tenant_mapping`**: Does not exist.

All task tables currently have 0 rows.

## Build Order

### Step 1 -- Fix `task_assignments` table

Add the missing `tenant_scope_start_at` column and enable RLS with staff-only policies.

- `ALTER TABLE task_assignments ADD COLUMN tenant_scope_start_at timestamptz NULL`
- Enable RLS
- Add SELECT, INSERT, UPDATE policies using `is_vivacity_staff(auth.uid())`

### Step 2 -- Create `v_tenant_task_requirements` (expansion view)

This is the missing glue that converts package-scoped task assignments into per-tenant rows.

Two CTEs:
- **package_scoped**: Joins `task_assignments` (scope_type = 'package') to `package_instances` (is_active = true, is_complete = false) to expand one assignment into one row per active tenant.
- **tenant_scoped**: Reads `task_assignments` (scope_type = 'tenant') directly.

Calculates `due_at` from `scope_start_at + due_days_after_start`.

### Step 3 -- Replace `v_tenant_tasks` with full joined view

Drop the current broken view and recreate it joining:
- `v_tenant_task_requirements` (the expansion)
- `tenant_task_status` (per-tenant completion tracking)
- `tasks` (ClickUp metadata: name, status, priority, hierarchy fields)

This becomes the single app-facing read surface for all tenant task data.

### Step 4 -- Create `clickup_tenant_mapping` table

For rule-based ClickUp hierarchy matching (exception mapping when folder/space patterns need to resolve to specific tenants).

```text
clickup_tenant_mapping
-----------------------
id              bigint (PK, generated)
tenant_id       bigint (FK -> tenants.id, ON DELETE CASCADE)
match_field     text   ('space_name' | 'folder_name_path' | 'list_name')
match_pattern   text   (exact string to match)
priority        int    (higher = checked first, default 0)
is_active       boolean (default true)
created_by      uuid
created_at      timestamptz
updated_at      timestamptz
UNIQUE(match_field, match_pattern)
CHECK(match_field IN ('space_name','folder_name_path','list_name'))
```

RLS: Staff-only read/write using `is_vivacity_staff(auth.uid())`.

### Step 5 -- Create `resolve_tenant_for_task` function

A SQL function that takes a task UUID, reads its `space_name`, `folder_name_path`, `list_name`, matches against `clickup_tenant_mapping` ordered by `priority DESC`, and returns the first matching `tenant_id` (or NULL).

### Step 6 -- Create `v_tasks_unmapped` view

Shows tasks from the `tasks` table that have no corresponding row in `task_tenant_map`, with suggested tenant matches from `clickup_tenant_mapping`. This powers a future admin "Map Unmapped Tasks" UI.

## No Frontend Changes in This Migration

This is purely a database stabilisation step. The existing frontend task pages will automatically benefit from the corrected `v_tenant_tasks` view once data flows in.

## Technical Details -- Full SQL

### Migration 1: Fix task_assignments

```sql
ALTER TABLE public.task_assignments
  ADD COLUMN IF NOT EXISTS tenant_scope_start_at timestamptz NULL;

ALTER TABLE public.task_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY task_assignments_staff_read
  ON public.task_assignments FOR SELECT TO authenticated
  USING (public.is_vivacity_staff(auth.uid()));

CREATE POLICY task_assignments_staff_write
  ON public.task_assignments FOR INSERT TO authenticated
  WITH CHECK (public.is_vivacity_staff(auth.uid()));

CREATE POLICY task_assignments_staff_update
  ON public.task_assignments FOR UPDATE TO authenticated
  USING (public.is_vivacity_staff(auth.uid()))
  WITH CHECK (public.is_vivacity_staff(auth.uid()));
```

### Migration 2: Create v_tenant_task_requirements

```sql
CREATE OR REPLACE VIEW public.v_tenant_task_requirements AS
WITH package_scoped AS (
  SELECT
    ta.id AS assignment_id,
    pi.tenant_id,
    ta.task_id,
    ta.is_required,
    ta.due_days_after_start,
    COALESCE(ta.tenant_scope_start_at, pi.start_date::timestamptz) AS scope_start_at,
    'package'::text AS derived_from
  FROM public.task_assignments ta
  JOIN public.package_instances pi
    ON pi.package_id = ta.package_id
   AND pi.is_active = true
   AND pi.is_complete = false
  WHERE ta.scope_type = 'package'
),
tenant_scoped AS (
  SELECT
    ta.id AS assignment_id,
    ta.tenant_id,
    ta.task_id,
    ta.is_required,
    ta.due_days_after_start,
    ta.tenant_scope_start_at AS scope_start_at,
    'tenant'::text AS derived_from
  FROM public.task_assignments ta
  WHERE ta.scope_type = 'tenant'
)
SELECT
  r.*,
  CASE
    WHEN r.due_days_after_start IS NULL THEN NULL
    WHEN r.scope_start_at IS NULL
      THEN (now() + (r.due_days_after_start || ' days')::interval)
    ELSE (r.scope_start_at + (r.due_days_after_start || ' days')::interval)
  END AS due_at
FROM (
  SELECT * FROM package_scoped
  UNION ALL
  SELECT * FROM tenant_scoped
) r;
```

### Migration 3: Replace v_tenant_tasks

```sql
DROP VIEW IF EXISTS public.v_tenant_tasks;

CREATE OR REPLACE VIEW public.v_tenant_tasks AS
SELECT
  r.tenant_id,
  r.assignment_id,
  r.task_id,
  r.derived_from,
  r.is_required,
  r.scope_start_at,
  r.due_at,
  COALESCE(ts.status, 'open') AS tenant_status,
  ts.completed_at,
  ts.completed_by,
  t.task_name,
  t.status AS clickup_status,
  t.priority,
  t.due_date_at,
  t.space_name,
  t.folder_name_path,
  t.list_name
FROM public.v_tenant_task_requirements r
LEFT JOIN public.tenant_task_status ts
  ON ts.tenant_id = r.tenant_id
 AND ts.assignment_id = r.assignment_id
LEFT JOIN public.tasks t
  ON t.task_id = r.task_id;
```

### Migration 4: Create clickup_tenant_mapping + resolver + unmapped view

```sql
CREATE TABLE IF NOT EXISTS public.clickup_tenant_mapping (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id bigint NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  match_field text NOT NULL CHECK (match_field IN ('space_name','folder_name_path','list_name')),
  match_pattern text NOT NULL,
  priority int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(match_field, match_pattern)
);

CREATE INDEX IF NOT EXISTS idx_clickup_mapping_active
  ON public.clickup_tenant_mapping (match_field, match_pattern)
  WHERE is_active = true;

ALTER TABLE public.clickup_tenant_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY clickup_tenant_mapping_read
  ON public.clickup_tenant_mapping FOR SELECT TO authenticated
  USING (public.is_vivacity_staff(auth.uid()));

CREATE POLICY clickup_tenant_mapping_write
  ON public.clickup_tenant_mapping FOR INSERT TO authenticated
  WITH CHECK (public.is_vivacity_staff(auth.uid()));

CREATE POLICY clickup_tenant_mapping_update
  ON public.clickup_tenant_mapping FOR UPDATE TO authenticated
  USING (public.is_vivacity_staff(auth.uid()))
  WITH CHECK (public.is_vivacity_staff(auth.uid()));

CREATE POLICY clickup_tenant_mapping_delete
  ON public.clickup_tenant_mapping FOR DELETE TO authenticated
  USING (public.is_vivacity_staff(auth.uid()));

-- Resolver function
CREATE OR REPLACE FUNCTION public.resolve_tenant_for_task(p_task_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.tenant_id
  FROM public.tasks t
  JOIN public.clickup_tenant_mapping m
    ON m.is_active = true
   AND (
     (m.match_field = 'space_name'       AND t.space_name = m.match_pattern)
     OR (m.match_field = 'folder_name_path' AND t.folder_name_path = m.match_pattern)
     OR (m.match_field = 'list_name'        AND t.list_name = m.match_pattern)
   )
  WHERE t.id = p_task_id
  ORDER BY m.priority DESC
  LIMIT 1;
$$;

-- Unmapped tasks view
CREATE OR REPLACE VIEW public.v_tasks_unmapped AS
SELECT
  t.id,
  t.task_id,
  t.task_name,
  t.space_name,
  t.folder_name_path,
  t.list_name,
  public.resolve_tenant_for_task(t.id) AS suggested_tenant_id
FROM public.tasks t
WHERE NOT EXISTS (
  SELECT 1 FROM public.task_tenant_map ttm WHERE ttm.task_id = t.task_id
);
```

### Supporting index

```sql
CREATE INDEX IF NOT EXISTS idx_package_instances_active_pkg
  ON public.package_instances (package_id, tenant_id)
  WHERE is_active = true AND is_complete = false;
```

## Summary

After this migration:
- `task_assignments` is complete and secured
- `v_tenant_task_requirements` expands package-level assignments to per-tenant rows
- `v_tenant_tasks` is the single app-facing read surface joining requirements, statuses, and ClickUp metadata
- `clickup_tenant_mapping` enables rule-based tenant resolution for incoming ClickUp tasks
- `v_tasks_unmapped` surfaces tasks needing manual or rule-based mapping
- All tables have RLS enforcing Vivacity-staff-only access

