CREATE OR REPLACE VIEW public.v_clickup_comments
WITH (security_invoker = true)
AS
SELECT
  t.tenant_id,
  t.name        AS task_name,
  t.url         AS clickup_url,
  c.task_id,
  c.id          AS comment_row_id,
  c.comment_id,
  c.comment_text,
  c.comment_by,
  to_timestamp(c.date_created / 1000.0) AS comment_date
FROM public.clickup_task_comments c
LEFT JOIN public.clickup_tasks_api t ON t.task_id = c.task_id;