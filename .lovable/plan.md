

# Plan: Fix Staff Task Instances Status Column

## Overview

Truncate and reinsert `public.staff_task_instances` using the `value` column from `dd_status` instead of `description`.

---

## Step 1: Truncate staff_task_instances

```sql
TRUNCATE TABLE public.staff_task_instances;
```

---

## Step 2: Reinsert with correct status value (69,208 records)

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
  ds.value,
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
```

---

## Verification Query

```sql
SELECT status_id, status, COUNT(*) 
FROM public.staff_task_instances 
GROUP BY status_id, status 
ORDER BY status_id;
```

Expected output should show lowercase values like `not_started`, `in_progress`, `completed`, `na`.

---

## Execution Summary

| Step | Action |
|------|--------|
| 1 | Truncate staff_task_instances |
| 2 | Reinsert with ds.value instead of ds.description |
| 3 | Verify status values are lowercase |

