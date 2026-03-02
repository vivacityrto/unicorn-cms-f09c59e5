
-- Backfill included_minutes from package template total_hours for all instances where it's currently 0
UPDATE package_instances pi
SET included_minutes = p.total_hours * 60
FROM packages p
WHERE pi.package_id = p.id
  AND pi.included_minutes = 0
  AND p.total_hours > 0;
