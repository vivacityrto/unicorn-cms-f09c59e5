-- Seed eos_meeting_attendees from eos_meeting_participants for the Level 10 meeting
INSERT INTO eos_meeting_attendees (
  meeting_id, 
  user_id, 
  role_in_meeting, 
  attendance_status, 
  created_at, 
  updated_at
)
SELECT 
  p.meeting_id,
  p.user_id,
  CASE p.role 
    WHEN 'Leader' THEN 'owner'::meeting_role
    WHEN 'Member' THEN 'attendee'::meeting_role
    WHEN 'Observer' THEN 'guest'::meeting_role
    ELSE 'attendee'::meeting_role
  END,
  'invited'::meeting_attendance_status,
  NOW(),
  NOW()
FROM eos_meeting_participants p
WHERE p.meeting_id = '64a80954-66e0-40b6-b595-0fa68a1ec4bb'
ON CONFLICT (meeting_id, user_id) DO NOTHING;