-- v_client_package_hours_by_type
-- Per-package aggregation of time_entries grouped by work_type + work_sub_type.
-- Powers the client portal "Where your hours went" surface.
-- Strictly additive. security_invoker delegates RLS to underlying tables.
CREATE OR REPLACE VIEW public.v_client_package_hours_by_type
WITH (security_invoker = true) AS
WITH per_entry AS (
  SELECT
    te.package_instance_id::bigint                                       AS package_instance_id,
    pi.tenant_id::bigint                                                 AS tenant_id,
    COALESCE(NULLIF(TRIM(te.work_type), ''), 'Other')                    AS work_type,
    NULLIF(TRIM(te.work_sub_type), '')                                   AS work_sub_type,
    te.duration_minutes
  FROM public.time_entries te
  JOIN public.package_instances pi ON pi.id = te.package_instance_id
  WHERE te.package_instance_id IS NOT NULL
    AND te.duration_minutes IS NOT NULL
    AND te.duration_minutes > 0
    AND (pi.start_date IS NULL OR te.start_at >= pi.start_date)
),
totals AS (
  SELECT package_instance_id, SUM(duration_minutes)::numeric AS total_minutes
  FROM per_entry
  GROUP BY package_instance_id
),
grouped AS (
  SELECT
    pe.package_instance_id,
    pe.tenant_id,
    pe.work_type,
    pe.work_sub_type,
    SUM(pe.duration_minutes)::numeric                                    AS minutes,
    SUM(pe.duration_minutes)::numeric / 60.0                             AS hours
  FROM per_entry pe
  GROUP BY pe.package_instance_id, pe.tenant_id, pe.work_type, pe.work_sub_type
)
SELECT
  g.package_instance_id,
  g.tenant_id,
  g.work_type,
  g.work_sub_type,
  g.minutes,
  ROUND(g.hours, 2)                                                      AS hours,
  CASE WHEN t.total_minutes = 0 THEN 0::numeric
       ELSE ROUND(g.minutes / t.total_minutes, 4)
  END                                                                    AS pct_of_total,
  ROW_NUMBER() OVER (
    PARTITION BY g.package_instance_id
    ORDER BY g.minutes DESC, g.work_type ASC
  )                                                                      AS rank_in_package
FROM grouped g
JOIN totals t ON t.package_instance_id = g.package_instance_id;

GRANT SELECT ON public.v_client_package_hours_by_type TO authenticated;

COMMENT ON VIEW public.v_client_package_hours_by_type IS
  'Per-package hours-by-category aggregation for the client portal "Where your hours went" surface. '
  'Sources from time_entries within package period (start_at >= pi.start_date). '
  'No is_billable distinction surfaced. security_invoker=true.';

-- v_client_package_hours_recent
-- Last 10 time_entries per package_instance for the "Recent work" surface.
-- Client-facing fields only — no user attribution, no is_billable.
CREATE OR REPLACE VIEW public.v_client_package_hours_recent
WITH (security_invoker = true) AS
WITH ranked AS (
  SELECT
    te.id                                                                AS entry_id,
    te.package_instance_id::bigint                                       AS package_instance_id,
    pi.tenant_id::bigint                                                 AS tenant_id,
    te.start_at                                                          AS occurred_at,
    te.duration_minutes,
    ROUND(te.duration_minutes::numeric / 60.0, 2)                        AS hours,
    COALESCE(NULLIF(TRIM(te.work_type), ''), 'Other')                    AS work_type,
    NULLIF(TRIM(te.work_sub_type), '')                                   AS work_sub_type,
    NULLIF(TRIM(te.notes), '')                                           AS notes,
    ROW_NUMBER() OVER (
      PARTITION BY te.package_instance_id
      ORDER BY te.start_at DESC NULLS LAST, te.id DESC
    )                                                                    AS rank_in_package
  FROM public.time_entries te
  JOIN public.package_instances pi ON pi.id = te.package_instance_id
  WHERE te.package_instance_id IS NOT NULL
    AND te.duration_minutes IS NOT NULL
    AND te.duration_minutes > 0
    AND (pi.start_date IS NULL OR te.start_at >= pi.start_date)
)
SELECT
  entry_id,
  package_instance_id,
  tenant_id,
  occurred_at,
  duration_minutes,
  hours,
  work_type,
  work_sub_type,
  notes,
  rank_in_package
FROM ranked
WHERE rank_in_package <= 10;

GRANT SELECT ON public.v_client_package_hours_recent TO authenticated;

COMMENT ON VIEW public.v_client_package_hours_recent IS
  'Per-package recent time entries (top 10 by occurred_at) for the client portal "Recent work" surface. '
  'No staff attribution. No is_billable. security_invoker=true.';