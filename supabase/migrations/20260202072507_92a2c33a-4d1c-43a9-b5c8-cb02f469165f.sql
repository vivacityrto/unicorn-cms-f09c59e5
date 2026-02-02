-- Populate stage_sortorder from package_stages
UPDATE stage_instances
SET stage_sortorder = ps.sort_order
FROM package_instances pi
JOIN package_stages ps ON ps.package_id = pi.package_id
WHERE stage_instances.packageinstance_id = pi.id
  AND stage_instances.stage_id = ps.stage_id
  AND stage_instances.stage_sortorder IS NULL;