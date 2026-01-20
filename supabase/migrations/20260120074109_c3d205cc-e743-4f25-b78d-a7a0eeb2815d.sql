-- Fix security definer views for EOS meetings
-- Replace with SECURITY INVOKER views

DROP VIEW IF EXISTS public.eos_upcoming_meetings;
DROP VIEW IF EXISTS public.eos_past_meetings;

-- Recreate as SECURITY INVOKER (default, but explicit)
CREATE VIEW public.eos_upcoming_meetings 
WITH (security_invoker = true)
AS
SELECT 
  m.*,
  s.recurrence_type,
  s.is_active as series_is_active
FROM eos_meetings m
LEFT JOIN eos_meeting_series s ON m.series_id = s.id
WHERE m.status IN ('scheduled', 'in_progress')
  AND m.scheduled_date >= CURRENT_DATE
ORDER BY m.scheduled_date ASC;

CREATE VIEW public.eos_past_meetings 
WITH (security_invoker = true)
AS
SELECT 
  m.*,
  s.recurrence_type,
  s.title as series_title
FROM eos_meetings m
LEFT JOIN eos_meeting_series s ON m.series_id = s.id
WHERE m.status IN ('closed', 'completed', 'cancelled')
   OR (m.status = 'scheduled' AND m.scheduled_date < CURRENT_DATE)
ORDER BY m.scheduled_date DESC;

-- Grant permissions
GRANT SELECT ON public.eos_upcoming_meetings TO authenticated;
GRANT SELECT ON public.eos_past_meetings TO authenticated;