
-- 1. Add next_renewal_date column
ALTER TABLE package_instances ADD COLUMN next_renewal_date date;

-- 2. Backfill open records
UPDATE package_instances
SET next_renewal_date = start_date + INTERVAL '1 year'
WHERE end_date IS NULL;

-- 3. Auto-set trigger for future inserts
CREATE OR REPLACE FUNCTION set_default_renewal_date()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.next_renewal_date IS NULL AND NEW.start_date IS NOT NULL THEN
    NEW.next_renewal_date := NEW.start_date + INTERVAL '1 year';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_renewal_date
BEFORE INSERT ON package_instances
FOR EACH ROW EXECUTE FUNCTION set_default_renewal_date();

-- 4. Update v_package_burndown to scope to renewal year
CREATE OR REPLACE VIEW v_package_burndown AS
SELECT
  pi.tenant_id,
  pi.id AS package_instance_id,
  COALESCE(pi.included_minutes, 0) + COALESCE(pi.hours_added, 0) * 60 AS included_minutes,
  COALESCE(ts.used_minutes, 0::bigint) AS used_minutes,
  COALESCE(pi.included_minutes, 0) + COALESCE(pi.hours_added, 0) * 60 - COALESCE(ts.used_minutes, 0::bigint) AS remaining_minutes,
  CASE
    WHEN (COALESCE(pi.included_minutes, 0) + COALESCE(pi.hours_added, 0) * 60) = 0 THEN 0::numeric
    ELSE round(COALESCE(ts.used_minutes, 0::bigint)::numeric / (COALESCE(pi.included_minutes, 0) + COALESCE(pi.hours_added, 0) * 60)::numeric * 100::numeric, 1)
  END AS percent_used
FROM package_instances pi
LEFT JOIN (
  SELECT te.package_id, SUM(te.duration_minutes) AS used_minutes
  FROM time_entries te
  JOIN package_instances pi2 ON pi2.id = te.package_id
  WHERE te.package_id IS NOT NULL
    AND te.start_at >= COALESCE(pi2.next_renewal_date, pi2.start_date + INTERVAL '1 year') - INTERVAL '1 year'
    AND te.start_at < COALESCE(pi2.next_renewal_date, pi2.start_date + INTERVAL '1 year')
  GROUP BY te.package_id
) ts ON ts.package_id = pi.id
WHERE pi.is_complete = false;

-- 5. Update v_package_time_summary to scope to renewal year
CREATE OR REPLACE VIEW v_package_time_summary AS
SELECT
  te.tenant_id,
  te.package_id AS package_instance_id,
  sum(te.duration_minutes) FILTER (WHERE date_trunc('month', te.start_at) = date_trunc('month', now())) AS minutes_month,
  sum(te.duration_minutes) AS minutes_ytd,
  sum(te.duration_minutes) AS minutes_total,
  max(te.start_at) AS last_entry_at
FROM time_entries te
JOIN package_instances pi ON pi.id = te.package_id
WHERE te.package_id IS NOT NULL
  AND te.start_at >= COALESCE(pi.next_renewal_date, pi.start_date + INTERVAL '1 year') - INTERVAL '1 year'
  AND te.start_at < COALESCE(pi.next_renewal_date, pi.start_date + INTERVAL '1 year')
GROUP BY te.tenant_id, te.package_id;
