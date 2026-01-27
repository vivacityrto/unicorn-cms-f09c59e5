

# Plan: Complete Staff Tasks Data Migration

## Overview

Run the following SQL scripts in Supabase Cloud View > Run SQL to complete the staff tasks migration.

---

## Step 1: Populate public.staff_tasks (460 records)

```sql
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

---

## Step 2: Populate public.staff_task_instances (69,208 records)

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

---

## Verification Queries

After running the above, verify the counts:

```sql
-- Should return 460
SELECT COUNT(*) FROM public.staff_tasks;

-- Should return 69,208
SELECT COUNT(*) FROM public.staff_task_instances;

-- Check status mapping worked
SELECT status_id, status, COUNT(*) 
FROM public.staff_task_instances 
GROUP BY status_id, status 
ORDER BY status_id;
```

---

## Execution Summary

| Step | Action | Expected Records |
|------|--------|------------------|
| 1 | Populate staff_tasks | 460 |
| 2 | Populate staff_task_instances | 69,208 |
| 3 | Verify counts | - |

