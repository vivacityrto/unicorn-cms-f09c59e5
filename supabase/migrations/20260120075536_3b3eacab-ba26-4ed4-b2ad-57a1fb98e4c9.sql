-- Fix security definer view for attendance summary
DROP VIEW IF EXISTS public.eos_meeting_attendance_summary;

CREATE VIEW public.eos_meeting_attendance_summary 
WITH (security_invoker = true)
AS
SELECT 
  m.id AS meeting_id,
  m.meeting_type,
  m.title,
  m.scheduled_date,
  m.status,
  m.quorum_met,
  COUNT(a.id) FILTER (WHERE a.attendance_status::TEXT IN ('invited', 'attended', 'late', 'left_early', 'no_show')) AS invited_count,
  COUNT(a.id) FILTER (WHERE a.attendance_status::TEXT IN ('attended', 'late')) AS present_count,
  COUNT(a.id) FILTER (WHERE a.attendance_status::TEXT = 'late') AS late_count,
  COUNT(a.id) FILTER (WHERE a.attendance_status::TEXT = 'left_early') AS left_early_count,
  COUNT(a.id) FILTER (WHERE a.attendance_status::TEXT = 'no_show') AS no_show_count,
  CASE 
    WHEN COUNT(a.id) FILTER (WHERE a.attendance_status::TEXT != 'declined') > 0 
    THEN ROUND(100.0 * COUNT(a.id) FILTER (WHERE a.attendance_status::TEXT IN ('attended', 'late')) / 
         NULLIF(COUNT(a.id) FILTER (WHERE a.attendance_status::TEXT != 'declined'), 0), 1)
    ELSE 0 
  END AS attendance_rate
FROM eos_meetings m
LEFT JOIN eos_meeting_attendees a ON a.meeting_id = m.id
GROUP BY m.id;