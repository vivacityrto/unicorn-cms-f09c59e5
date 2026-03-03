
-- Fix: Drop and recreate v_user_notification_summary with new column
DROP VIEW IF EXISTS public.v_user_notification_summary;

CREATE VIEW public.v_user_notification_summary
WITH (security_invoker = true)
AS
SELECT
  user_notifications.user_id,
  count(*) FILTER (WHERE type = 'message' AND NOT is_read) AS unread_messages,
  count(*) FILTER (WHERE type = 'task' AND NOT is_read) AS unread_tasks,
  count(*) FILTER (WHERE type = 'document' AND NOT is_read) AS unread_documents,
  count(*) FILTER (WHERE type = 'broadcast' AND NOT is_read) AS unread_announcements,
  count(*) FILTER (WHERE NOT is_read) AS total_unread
FROM public.user_notifications
GROUP BY user_notifications.user_id;
