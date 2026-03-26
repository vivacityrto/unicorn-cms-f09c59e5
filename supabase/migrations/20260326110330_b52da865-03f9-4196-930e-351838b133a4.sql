-- Sync is_recurring flag from stages to stage_instances
UPDATE stage_instances si
SET is_recurring = true
FROM stages s
WHERE si.stage_id = s.id
  AND s.is_recurring = true
  AND (si.is_recurring IS NULL OR si.is_recurring = false);