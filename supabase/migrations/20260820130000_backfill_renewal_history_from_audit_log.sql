-- Backfill real renewal-period history from client_audit_log.
--
-- RenewalConfirmDialog has been writing an audit row on every renewal for a
-- while (action IN ('renewal_time_carry_over','renewal_time_forfeit'),
-- entity_type='package_instances', details containing from_period/to_period/
-- included_minutes/carried_minutes/remaining_minutes) - well before the
-- 2026-08-20 period-windowing fix. 18 real renewal events across 16 distinct
-- package instances exist in that log (2026-03-08 through 2026-08-06).
--
-- Two things this fixes:
-- 1. (Cosmetic) Reconstructs real CLOSED package_renewal_periods rows for
--    those past renewals, so the new "Renewal History" section on the Time
--    tab has genuine data instead of being empty for every client.
-- 2. (Live correctness bug) The original 2026-08-20 backfill gave every
--    instance's CURRENT open period carried_in_minutes = 0, regardless of
--    whether that instance's most recent real renewal actually carried
--    hours over. For any of these 16 instances where the last renewal was
--    "Carry Over" (not "Forfeit"), the live burndown/dashboard "included"
--    figure has been undercounting by that carried amount ever since. This
--    corrects the open period's carried_in_minutes to match the real last
--    renewal's carried_minutes.
--
-- Historical hours_used_at_close is reconstructed as
-- (included_minutes - remaining_minutes) from the audit log's own logged
-- figures at the moment of that renewal - this is the actual minutes used
-- in that period regardless of the allowance-calculation bugs the period-
-- windowing fix addressed, so it's a faithful reconstruction even though it
-- predates that fix.
--
-- Best-effort caveat (documented on the package_renewal_periods table
-- comment already): historical period_number here counts renewals we have
-- an audit trail for, not necessarily a client's true lifetime renewal
-- count - anything before 2026-03-08 (when this audit logging started) is
-- not recoverable.

-- Dedup guard: package_instance_id 15101 logged the SAME period boundary
-- (2025-06-13 -> 2026-06-13) twice - forfeit on 2026-06-16, then carry_over
-- on 2026-07-17 (an actual duplicate/retest of the same renewal, per
-- client_audit_log; not two distinct real periods). Keep whichever was
-- logged last per (instance, from_period, to_period) as the real outcome.
WITH audit_renewals AS (
  SELECT DISTINCT ON (cal.entity_id, cal.details->>'from_period', cal.details->>'to_period')
    (cal.entity_id)::bigint AS package_instance_id,
    cal.tenant_id,
    (cal.details->>'from_period')::date AS period_start,
    (cal.details->>'to_period')::date AS period_end,
    COALESCE((cal.details->>'included_minutes')::integer, 0) AS included_minutes,
    COALESCE((cal.details->>'carried_minutes')::integer, 0) AS carried_out_minutes,
    COALESCE((cal.details->>'remaining_minutes')::numeric, 0) AS remaining_minutes
  FROM public.client_audit_log cal
  WHERE cal.action IN ('renewal_time_carry_over', 'renewal_time_forfeit')
    AND cal.entity_type = 'package_instances'
    AND cal.details ? 'from_period'
    AND cal.details ? 'to_period'
  ORDER BY cal.entity_id, cal.details->>'from_period', cal.details->>'to_period', cal.created_at DESC
),
ordered AS (
  SELECT
    ar.*,
    ROW_NUMBER() OVER (PARTITION BY package_instance_id ORDER BY period_start) AS historical_period_number,
    COUNT(*) OVER (PARTITION BY package_instance_id) AS historical_count,
    LAG(carried_out_minutes) OVER (PARTITION BY package_instance_id ORDER BY period_start) AS carried_in_minutes,
    LAST_VALUE(carried_out_minutes) OVER (
      PARTITION BY package_instance_id ORDER BY period_start
      ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ) AS most_recent_carried_out_minutes
  FROM audit_renewals ar
)
-- 1) Make room: bump the existing open period's period_number so the
--    historical rows (1..N) can be inserted below it without colliding with
--    the unique (package_instance_id, period_number) constraint.
UPDATE public.package_renewal_periods prp
SET period_number = o.historical_count + 1
FROM (SELECT DISTINCT package_instance_id, historical_count FROM ordered) o
WHERE prp.package_instance_id = o.package_instance_id
  AND prp.closed_at IS NULL;

-- 2) Live correctness fix: the current open period's carry-in should match
--    what the client's most recent real renewal actually carried over, not
--    the 0 the original backfill assumed for every instance.
WITH latest_carry AS (
  SELECT DISTINCT ON (package_instance_id)
    package_instance_id, most_recent_carried_out_minutes
  FROM (
    WITH audit_renewals AS (
      SELECT DISTINCT ON (cal.entity_id, cal.details->>'from_period', cal.details->>'to_period')
        (cal.entity_id)::bigint AS package_instance_id,
        (cal.details->>'from_period')::date AS period_start,
        COALESCE((cal.details->>'carried_minutes')::integer, 0) AS carried_out_minutes
      FROM public.client_audit_log cal
      WHERE cal.action IN ('renewal_time_carry_over', 'renewal_time_forfeit')
        AND cal.entity_type = 'package_instances'
        AND cal.details ? 'from_period'
        AND cal.details ? 'to_period'
      ORDER BY cal.entity_id, cal.details->>'from_period', cal.details->>'to_period', cal.created_at DESC
    )
    SELECT package_instance_id,
           LAST_VALUE(carried_out_minutes) OVER (
             PARTITION BY package_instance_id ORDER BY period_start
             ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
           ) AS most_recent_carried_out_minutes
    FROM audit_renewals
  ) x
)
UPDATE public.package_renewal_periods prp
SET carried_in_minutes = lc.most_recent_carried_out_minutes
FROM latest_carry lc
WHERE prp.package_instance_id = lc.package_instance_id
  AND prp.closed_at IS NULL;

-- 3) Insert the reconstructed closed historical periods. (CTEs are scoped
--    to a single statement, so audit_renewals/ordered are redefined here -
--    same dedup + windowing logic as step 1.)
WITH audit_renewals AS (
  SELECT DISTINCT ON (cal.entity_id, cal.details->>'from_period', cal.details->>'to_period')
    (cal.entity_id)::bigint AS package_instance_id,
    cal.tenant_id,
    (cal.details->>'from_period')::date AS period_start,
    (cal.details->>'to_period')::date AS period_end,
    COALESCE((cal.details->>'included_minutes')::integer, 0) AS included_minutes,
    COALESCE((cal.details->>'carried_minutes')::integer, 0) AS carried_out_minutes,
    COALESCE((cal.details->>'remaining_minutes')::numeric, 0) AS remaining_minutes
  FROM public.client_audit_log cal
  WHERE cal.action IN ('renewal_time_carry_over', 'renewal_time_forfeit')
    AND cal.entity_type = 'package_instances'
    AND cal.details ? 'from_period'
    AND cal.details ? 'to_period'
  ORDER BY cal.entity_id, cal.details->>'from_period', cal.details->>'to_period', cal.created_at DESC
),
ordered AS (
  SELECT
    ar.*,
    ROW_NUMBER() OVER (PARTITION BY package_instance_id ORDER BY period_start) AS historical_period_number,
    LAG(carried_out_minutes) OVER (PARTITION BY package_instance_id ORDER BY period_start) AS carried_in_minutes
  FROM audit_renewals ar
)
INSERT INTO public.package_renewal_periods
  (tenant_id, package_instance_id, period_number, period_start, period_end,
   included_minutes, carried_in_minutes, hours_used_at_close, closed_at)
SELECT
  o.tenant_id,
  o.package_instance_id,
  o.historical_period_number,
  o.period_start,
  o.period_end,
  o.included_minutes,
  COALESCE(o.carried_in_minutes, 0),
  GREATEST(o.included_minutes - o.remaining_minutes, 0) / 60.0,
  o.period_end::timestamptz
FROM ordered o
WHERE NOT EXISTS (
  SELECT 1 FROM public.package_renewal_periods prp
  WHERE prp.package_instance_id = o.package_instance_id
    AND prp.period_start = o.period_start
);

-- 4) Recompute package_instances.start_renewal_date for these instances -
--    the original backfill derived it from (next_renewal_date - 1yr) math,
--    but the audit log's from_period/to_period is the actual recorded
--    renewal date, a more authoritative source where both exist.
UPDATE public.package_instances pi
SET start_renewal_date = prp.period_start
FROM public.package_renewal_periods prp
WHERE prp.package_instance_id = pi.id
  AND prp.closed_at IS NULL;
