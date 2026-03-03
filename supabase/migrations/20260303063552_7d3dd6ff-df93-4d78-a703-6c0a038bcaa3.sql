
-- Sprint 4: Notification summary view
CREATE OR REPLACE VIEW public.v_user_notification_summary
WITH (security_invoker = true)
AS
SELECT
  user_id,
  COUNT(*) FILTER (WHERE type = 'message' AND NOT is_read) AS unread_messages,
  COUNT(*) FILTER (WHERE type = 'task' AND NOT is_read) AS unread_tasks,
  COUNT(*) FILTER (WHERE type = 'document' AND NOT is_read) AS unread_documents,
  COUNT(*) FILTER (WHERE NOT is_read) AS total_unread
FROM public.user_notifications
GROUP BY user_id;
