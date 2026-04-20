
-- 1. Update L10 agenda templates: move "To-Do List" to be right after "Rock Review"
WITH new_segments AS (
  SELECT id,
    jsonb_agg(seg ORDER BY new_order) AS segments
  FROM (
    SELECT t.id,
      seg,
      CASE lower(seg->>'name')
        WHEN 'segue' THEN 1
        WHEN 'scorecard' THEN 2
        WHEN 'rock review' THEN 3
        WHEN 'to-do list' THEN 4
        WHEN 'todo list' THEN 4
        WHEN 'to-dos' THEN 4
        WHEN 'todos' THEN 4
        WHEN 'customer/employee headlines' THEN 5
        WHEN 'headlines' THEN 5
        WHEN 'ids' THEN 6
        WHEN 'ids (identify, discuss, solve)' THEN 6
        WHEN 'conclude' THEN 7
        ELSE 99
      END AS new_order
    FROM eos_agenda_templates t,
         jsonb_array_elements(t.segments) seg
    WHERE t.meeting_type = 'L10'
  ) sub
  GROUP BY id
)
UPDATE eos_agenda_templates t
SET segments = ns.segments,
    updated_at = now()
FROM new_segments ns
WHERE t.id = ns.id;

-- 2. Reorder segments for L10 meetings not yet completed
-- Only touch segments that haven't been completed yet (preserve audit trail)
WITH meetings_to_fix AS (
  SELECT m.id AS meeting_id
  FROM eos_meetings m
  WHERE m.meeting_type = 'L10'
    AND m.status IN ('scheduled', 'in_progress', 'ready_to_close')
),
reorder AS (
  SELECT s.id,
    CASE lower(s.segment_name)
      WHEN 'segue' THEN 1
      WHEN 'scorecard' THEN 2
      WHEN 'rock review' THEN 3
      WHEN 'to-do list' THEN 4
      WHEN 'todo list' THEN 4
      WHEN 'to-dos' THEN 4
      WHEN 'todos' THEN 4
      WHEN 'customer/employee headlines' THEN 5
      WHEN 'headlines' THEN 5
      WHEN 'ids' THEN 6
      WHEN 'ids (identify, discuss, solve)' THEN 6
      WHEN 'conclude' THEN 7
      ELSE s.sequence_order + 100
    END AS new_seq
  FROM eos_meeting_segments s
  JOIN meetings_to_fix m ON m.meeting_id = s.meeting_id
  WHERE s.completed_at IS NULL
)
UPDATE eos_meeting_segments s
SET sequence_order = r.new_seq
FROM reorder r
WHERE s.id = r.id
  AND s.sequence_order <> r.new_seq;
