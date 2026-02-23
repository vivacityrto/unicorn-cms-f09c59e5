-- One-time backfill: propagate tenant_id from tasks to orphaned comments
UPDATE clickup_task_comments c
SET tenant_id = t.tenant_id
FROM clickup_tasks_api t
WHERE c.task_id = t.task_id
  AND t.tenant_id IS NOT NULL
  AND c.tenant_id IS NULL;