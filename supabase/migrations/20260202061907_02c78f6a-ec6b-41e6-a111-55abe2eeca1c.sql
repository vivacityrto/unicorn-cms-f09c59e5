-- Fix the current stuck meeting by transitioning it to in_progress
UPDATE eos_meetings 
SET status = 'in_progress', 
    started_at = COALESCE(
      (SELECT MIN(started_at) 
       FROM eos_meeting_segments 
       WHERE meeting_id = '40eef3bc-25f8-4769-b445-2408d3c418b4'
         AND started_at IS NOT NULL),
      now()
    )
WHERE id = '40eef3bc-25f8-4769-b445-2408d3c418b4'
  AND status = 'scheduled';