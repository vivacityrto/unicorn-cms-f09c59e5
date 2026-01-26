-- Add all EOS team members from tenant 319 as attendees for the meeting
INSERT INTO eos_meeting_attendees (meeting_id, user_id, role_in_meeting, attendance_status, created_at, updated_at)
SELECT 
  '64a80954-66e0-40b6-b595-0fa68a1ec4bb',
  eur.user_id,
  'attendee'::meeting_role,
  'invited'::meeting_attendance_status,
  NOW(),
  NOW()
FROM eos_user_roles eur
WHERE eur.tenant_id = 319
  AND eur.user_id != '611a7972-c465-4b08-8ff4-ebbb5faa14f0' -- Exclude the owner already added
ON CONFLICT (meeting_id, user_id) DO NOTHING;