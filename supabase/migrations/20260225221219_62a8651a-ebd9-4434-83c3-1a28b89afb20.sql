CREATE OR REPLACE VIEW v_package_burndown AS
SELECT
  pi.tenant_id,
  pi.id AS package_instance_id,
  COALESCE(pi.included_minutes, 0) + COALESCE(pi.hours_added, 0) * 60 AS included_minutes,
  COALESCE(ts.used_minutes, 0::bigint) AS used_minutes,
  COALESCE(pi.included_minutes, 0) + COALESCE(pi.hours_added, 0) * 60 - COALESCE(ts.used_minutes, 0::bigint) AS remaining_minutes,
  CASE
    WHEN (COALESCE(pi.included_minutes, 0) + COALESCE(pi.hours_added, 0) * 60) = 0 THEN 0::numeric
    ELSE round(
      COALESCE(ts.used_minutes, 0::bigint)::numeric
      / (COALESCE(pi.included_minutes, 0) + COALESCE(pi.hours_added, 0) * 60)::numeric
      * 100::numeric, 1
    )
  END AS percent_used
FROM package_instances pi
LEFT JOIN (
  SELECT time_entries.package_id,
         sum(time_entries.duration_minutes) AS used_minutes
  FROM time_entries
  WHERE time_entries.package_id IS NOT NULL
  GROUP BY time_entries.package_id
) ts ON ts.package_id = pi.id
WHERE pi.is_complete = false;