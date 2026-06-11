CREATE OR REPLACE VIEW public.v_client_package_hours_recent
WITH (security_invoker = true) AS
WITH ranked AS (
  SELECT te.id AS entry_id,
         te.package_instance_id,
         pi.tenant_id,
         te.start_at AS occurred_at,
         te.duration_minutes,
         round(te.duration_minutes::numeric / 60.0, 2) AS hours,
         COALESCE(NULLIF(TRIM(BOTH FROM te.work_type), ''), 'Other') AS work_type,
         NULLIF(TRIM(BOTH FROM te.work_sub_type), '') AS work_sub_type,
         NULLIF(TRIM(BOTH FROM te.notes), '') AS notes,
         te.is_billable,
         row_number() OVER (PARTITION BY te.package_instance_id ORDER BY te.start_at DESC NULLS LAST, te.id DESC) AS rank_in_package
  FROM public.time_entries te
  JOIN public.package_instances pi ON pi.id = te.package_instance_id
  WHERE te.package_instance_id IS NOT NULL
    AND (pi.start_date IS NULL OR te.start_at >= pi.start_date)
)
SELECT entry_id, package_instance_id, tenant_id, occurred_at, duration_minutes,
       hours, work_type, work_sub_type, notes, rank_in_package, is_billable
FROM ranked
WHERE rank_in_package <= 10;