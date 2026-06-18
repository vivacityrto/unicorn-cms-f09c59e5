CREATE OR REPLACE VIEW public.v_client_reporting_reminders AS
WITH tenant_audience AS (
  SELECT t.id AS tenant_id,
         t.name AS tenant_name,
         TRIM(BOTH FROM t.rto_id) ~ '^\d{4,6}$'::text  AS is_rto,
         TRIM(BOTH FROM t.cricos_id) ~ '^\d+[A-Z]$'::text AS is_cricos
    FROM public.tenants t
),
obligations_with_dates AS (
  SELECT o.id,
         o.code,
         o.title,
         o.description,
         a.value AS audience,
         r.value AS recurrence,
         o.annual_month,
         o.annual_day,
         o.window_opens_month,
         o.window_opens_day,
         o.cta_label,
         o.cta_url,
         o.sort_order,
         o.is_active,
         o.created_at,
         o.updated_at,
         CASE
           WHEN (r.value = ANY (ARRAY['annual_fixed'::text, 'annual_window'::text]))
                AND o.annual_month IS NOT NULL
                AND o.annual_day IS NOT NULL THEN
             CASE
               WHEN make_date(
                      EXTRACT(year FROM (pg_catalog.now() AT TIME ZONE 'Australia/Sydney'))::integer,
                      o.annual_month, o.annual_day
                    ) >= (pg_catalog.now() AT TIME ZONE 'Australia/Sydney')::date
               THEN make_date(
                      EXTRACT(year FROM (pg_catalog.now() AT TIME ZONE 'Australia/Sydney'))::integer,
                      o.annual_month, o.annual_day
                    )
               ELSE make_date(
                      EXTRACT(year FROM (pg_catalog.now() AT TIME ZONE 'Australia/Sydney'))::integer + 1,
                      o.annual_month, o.annual_day
                    )
             END
           ELSE NULL::date
         END AS next_date,
         CASE
           WHEN r.value = 'annual_window'::text
                AND o.window_opens_month IS NOT NULL
                AND o.window_opens_day IS NOT NULL THEN
             CASE
               WHEN make_date(
                      EXTRACT(year FROM (pg_catalog.now() AT TIME ZONE 'Australia/Sydney'))::integer,
                      o.window_opens_month, o.window_opens_day
                    ) >= (pg_catalog.now() AT TIME ZONE 'Australia/Sydney')::date
               THEN make_date(
                      EXTRACT(year FROM (pg_catalog.now() AT TIME ZONE 'Australia/Sydney'))::integer,
                      o.window_opens_month, o.window_opens_day
                    )
               ELSE make_date(
                      EXTRACT(year FROM (pg_catalog.now() AT TIME ZONE 'Australia/Sydney'))::integer + 1,
                      o.window_opens_month, o.window_opens_day
                    )
             END
           ELSE NULL::date
         END AS window_opens_at
    FROM public.compliance_obligations o
    JOIN public.dd_obligation_audience   a ON a.id = o.audience_id
    JOIN public.dd_obligation_recurrence r ON r.id = o.recurrence_id
   WHERE o.is_active = true
)
SELECT ta.tenant_id,
       o.id AS obligation_id,
       o.code,
       o.title,
       o.description,
       o.audience,
       o.recurrence,
       o.next_date,
       o.window_opens_at,
       o.cta_label,
       o.cta_url,
       o.sort_order,
       CASE
         WHEN o.next_date IS NOT NULL
           THEN o.next_date - (pg_catalog.now() AT TIME ZONE 'Australia/Sydney')::date
         ELSE NULL::integer
       END AS days_until,
       CASE
         WHEN o.recurrence = 'always_open'::text         THEN 'always_open'::text
         WHEN o.recurrence = 'rolling_per_tenant'::text  THEN 'no_date'::text
         WHEN o.next_date IS NULL                        THEN 'no_date'::text
         WHEN o.next_date < (pg_catalog.now() AT TIME ZONE 'Australia/Sydney')::date THEN 'overdue'::text
         WHEN (o.next_date - (pg_catalog.now() AT TIME ZONE 'Australia/Sydney')::date) <= 60 THEN 'due_soon'::text
         ELSE 'upcoming'::text
       END AS status
  FROM tenant_audience ta
  CROSS JOIN obligations_with_dates o
 WHERE CASE
         WHEN o.audience = 'rto'::text            THEN ta.is_rto
         WHEN o.audience = 'cricos'::text         THEN ta.is_cricos
         WHEN o.audience = 'rto_or_cricos'::text  THEN ta.is_rto OR ta.is_cricos
         ELSE false
       END
 ORDER BY ta.tenant_id, o.sort_order;