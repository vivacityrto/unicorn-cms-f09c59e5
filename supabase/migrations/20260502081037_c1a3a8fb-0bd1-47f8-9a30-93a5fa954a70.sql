-- v_client_package_hours_timeline
-- Per-package daily cumulative hours used, for the client burndown chart.
-- Sparse — one row per (package_instance, day-with-activity).
-- AEST/AEDT date bucketing matches Australian operational reality.
-- Strictly additive. security_invoker delegates RLS to underlying tables.

CREATE OR REPLACE VIEW public.v_client_package_hours_timeline
WITH (security_invoker = true) AS
WITH daily AS (
  SELECT
    te.package_instance_id::bigint                                       AS package_instance_id,
    pi.tenant_id::bigint                                                 AS tenant_id,
    (te.start_at AT TIME ZONE 'Australia/Sydney')::date                  AS activity_date,
    SUM(te.duration_minutes)::numeric / 60.0                             AS hours_on_day
  FROM public.time_entries te
  JOIN public.package_instances pi ON pi.id = te.package_instance_id
  WHERE te.package_instance_id IS NOT NULL
    AND te.duration_minutes IS NOT NULL
    AND te.duration_minutes > 0
    AND (pi.start_date IS NULL OR te.start_at >= pi.start_date)
  GROUP BY te.package_instance_id, pi.tenant_id, (te.start_at AT TIME ZONE 'Australia/Sydney')::date
)
SELECT
  d.package_instance_id,
  d.tenant_id,
  d.activity_date,
  ROUND(d.hours_on_day, 2)                                               AS hours_on_day,
  ROUND(
    SUM(d.hours_on_day) OVER (
      PARTITION BY d.package_instance_id
      ORDER BY d.activity_date ASC
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ),
    2
  )::numeric                                                             AS cumulative_hours_used,
  ROW_NUMBER() OVER (
    PARTITION BY d.package_instance_id
    ORDER BY d.activity_date ASC
  )::int                                                                 AS point_rank
FROM daily d
ORDER BY d.package_instance_id, d.activity_date ASC;

GRANT SELECT ON public.v_client_package_hours_timeline TO authenticated;

COMMENT ON VIEW public.v_client_package_hours_timeline IS
  'Per-package daily cumulative hours used, for the client burndown chart. '
  'Sparse — only days with activity. AEST/AEDT date bucketing. '
  'Sources from time_entries within package period (start_at >= pi.start_date). '
  'No is_billable distinction. security_invoker=true.';