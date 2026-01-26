-- Reset the Level 10 meeting for January 27, 2026 that was incorrectly marked as complete
UPDATE eos_meetings 
SET 
  is_complete = false,
  completed_at = NULL,
  started_at = NULL,
  closed_at = NULL,
  status = 'scheduled',
  updated_at = NOW()
WHERE id = '64a80954-66e0-40b6-b595-0fa68a1ec4bb';