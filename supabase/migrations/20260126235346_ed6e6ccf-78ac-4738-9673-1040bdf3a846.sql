-- Reset all meeting segments for the Level 10 meeting on January 27
UPDATE eos_meeting_segments 
SET 
  started_at = NULL,
  completed_at = NULL
WHERE meeting_id = '64a80954-66e0-40b6-b595-0fa68a1ec4bb';