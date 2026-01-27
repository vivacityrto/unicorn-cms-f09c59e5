

# Plan: Update dd_status Values and Run Staff Tasks Migration

## Part 1: Update dd_status Value Column

Update the `value` column in `public.dd_status` to be a normalized version of the description:
- Lowercase
- Spaces replaced with underscores
- Forward slashes removed

### SQL Update
```sql
UPDATE public.dd_status
SET value = LOWER(REPLACE(REPLACE(description, ' ', '_'), '/', ''));
```

### Result Preview
| code | description | value |
|------|-------------|-------|
| 0 | Not Started | not_started |
| 1 | In Progress | in_progress |
| 2 | Completed | completed |
| 3 | N/A | na |
| 100 | Active | active |
| 101 | Disabled | disabled |
| 102 | On Hold | on_hold |
| 103 | Overrun | overrun |

---

## Part 2: Staff Tasks Migration (Full)

### Step 1: Populate public.staff_tasks (460 templates)
```sql
TRUNCATE TABLE public.staff_tasks;

INSERT INTO public.staff_tasks (id, order_number, name, description, stage_id, due_date_offset)
OVERRIDING SYSTEM VALUE
SELECT id, ordernumber, name, description, stage_id, duedateoffset
FROM unicorn1.staff_tasks;

SELECT setval(
  pg_get_serial_sequence('public.staff_tasks', 'id'),
  (SELECT COALESCE(MAX(id), 0) + 1 FROM public.staff_tasks),
  false
);
```

### Step 2: Create public.staff_task_instances
```sql
CREATE TABLE public.staff_task_instances (
  id bigint PRIMARY KEY,
  staff_task_id bigint NOT NULL,
  stage_instance_id bigint NOT NULL,
  status_id integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Not Started',
  completion_date timestamp with time zone,
  due_date timestamp with time zone,
  assigned_date timestamp with time zone,
  notes text,
  assignee_id uuid,
  u1_assignee_id integer,
  u1_id integer,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX idx_staff_task_instances_stage_instance_id 
  ON public.staff_task_instances(stage_instance_id);
CREATE INDEX idx_staff_task_instances_staff_task_id 
  ON public.staff_task_instances(staff_task_id);
CREATE INDEX idx_staff_task_instances_assignee_id 
  ON public.staff_task_instances(assignee_id);

ALTER TABLE public.staff_task_instances ENABLE ROW LEVEL SECURITY;
```

### Step 3: Populate with Triple Join (69,208 records)
```sql
INSERT INTO public.staff_task_instances (
  id, staff_task_id, stage_instance_id, 
  status_id, status,
  completion_date, due_date, assigned_date, notes,
  assignee_id, u1_assignee_id, u1_id
)
SELECT 
  sti.id,
  sti.stafftask_id,
  sti.stageinstance_id,
  sti.status,
  ds.description,
  sti.completiondate,
  sti.duedate,
  sti.assigneddate,
  sti.notes,
  u.user_uuid,
  sti.assignee_id,
  sti.id
FROM unicorn1.staff_task_instances sti
LEFT JOIN public.users u ON sti.assignee_id = u.legacy_id
LEFT JOIN public.dd_status ds ON sti.status = ds.code;

SELECT setval(
  pg_get_serial_sequence('public.staff_task_instances', 'id'),
  (SELECT COALESCE(MAX(id), 0) + 1 FROM public.staff_task_instances),
  false
);
```

### Step 4: Add RLS Policies
```sql
CREATE POLICY "Users can view staff task instances"
  ON public.staff_task_instances
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can update staff task instances"
  ON public.staff_task_instances
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
```

---

## Execution Summary

| Step | Action | Records |
|------|--------|---------|
| 1 | Update dd_status values | 8 |
| 2 | Populate staff_tasks | 460 |
| 3 | Create staff_task_instances table | - |
| 4 | Populate staff_task_instances | 69,208 |
| 5 | Add RLS policies | 2 |

