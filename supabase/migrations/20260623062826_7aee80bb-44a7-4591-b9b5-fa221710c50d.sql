
CREATE OR REPLACE VIEW public.v_kpi_csc_summary
WITH (security_invoker = true) AS
WITH time_rollup AS (
  SELECT
    te.user_id                                AS subject_uuid,
    date_trunc('week', te.start_at)::date     AS period_start,
    'weekly'::text                            AS period_type,
    COUNT(*)                                  AS entry_count,
    COALESCE(SUM(te.duration_minutes), 0)     AS total_minutes,
    COALESCE(SUM(te.duration_minutes) FILTER (WHERE te.is_billable IS TRUE), 0) AS billable_minutes
  FROM public.time_entries te
  WHERE te.start_at IS NOT NULL
    AND te.user_id IS NOT NULL
  GROUP BY te.user_id, date_trunc('week', te.start_at)
)
SELECT
  tr.subject_uuid, tr.period_start, tr.period_type,
  tr.entry_count, tr.total_minutes, tr.billable_minutes,
  ROUND(CASE WHEN tr.total_minutes > 0
             THEN (tr.billable_minutes::numeric / tr.total_minutes::numeric) * 100
             ELSE 0 END, 2)   AS billable_pct,
  r.overall_status            AS review_status,
  r.locked_at                 AS review_locked_at
FROM time_rollup tr
LEFT JOIN public.kpi_reviews r
  ON r.subject_uuid = tr.subject_uuid
 AND r.kpi_role     = 'csc'
 AND r.period_type  = tr.period_type
 AND r.period_start = tr.period_start;

CREATE OR REPLACE VIEW public.v_kpi_cst_summary
WITH (security_invoker = true) AS
WITH email_rollup AS (
  SELECT
    el.user_uuid                              AS subject_uuid,
    date_trunc('week', el.received_at)::date  AS period_start,
    'weekly'::text                            AS period_type,
    COUNT(*) FILTER (WHERE el.email_type = 'general_email')                                  AS sla1_total,
    COUNT(*) FILTER (WHERE el.email_type = 'general_email'  AND el.sla_met IS TRUE)          AS sla1_met,
    COUNT(*) FILTER (WHERE el.email_type = 'client_message')                                 AS sla2_total,
    COUNT(*) FILTER (WHERE el.email_type = 'client_message' AND el.sla_met IS TRUE)          AS sla2_met,
    AVG(el.response_minutes) FILTER (WHERE el.email_type = 'general_email')                  AS sla1_avg_minutes,
    AVG(el.response_minutes) FILTER (WHERE el.email_type = 'client_message')                 AS sla2_avg_minutes
  FROM public.kpi_email_log el
  WHERE el.received_at IS NOT NULL AND el.user_uuid IS NOT NULL
  GROUP BY el.user_uuid, date_trunc('week', el.received_at)
),
task_rollup AS (
  SELECT
    t.assignee_uuid                                                          AS subject_uuid,
    date_trunc('week', COALESCE(t.completed_at, t.created_at))::date         AS period_start,
    'weekly'::text                                                           AS period_type,
    COUNT(*)                                                                 AS tasks_total,
    COUNT(*) FILTER (WHERE t.completed_at IS NOT NULL)                       AS tasks_completed,
    COUNT(*) FILTER (
      WHERE t.completed_at IS NOT NULL
        AND t.due_at IS NOT NULL
        AND t.completed_at <= t.due_at
    )                                                                        AS tasks_on_time
  FROM public.kpi_tasks t
  WHERE t.assignee_uuid IS NOT NULL
  GROUP BY t.assignee_uuid, date_trunc('week', COALESCE(t.completed_at, t.created_at))
)
SELECT
  COALESCE(e.subject_uuid, k.subject_uuid)   AS subject_uuid,
  COALESCE(e.period_start, k.period_start)   AS period_start,
  COALESCE(e.period_type, k.period_type)     AS period_type,
  COALESCE(e.sla1_total, 0)                  AS sla1_total,
  COALESCE(e.sla1_met,   0)                  AS sla1_met,
  ROUND(CASE WHEN COALESCE(e.sla1_total,0) > 0
             THEN (e.sla1_met::numeric / e.sla1_total::numeric) * 100
             ELSE 0 END, 2)                  AS sla1_pct,
  ROUND(e.sla1_avg_minutes::numeric, 1)      AS sla1_avg_minutes,
  COALESCE(e.sla2_total, 0)                  AS sla2_total,
  COALESCE(e.sla2_met,   0)                  AS sla2_met,
  ROUND(CASE WHEN COALESCE(e.sla2_total,0) > 0
             THEN (e.sla2_met::numeric / e.sla2_total::numeric) * 100
             ELSE 0 END, 2)                  AS sla2_pct,
  ROUND(e.sla2_avg_minutes::numeric, 1)      AS sla2_avg_minutes,
  COALESCE(k.tasks_total, 0)                 AS tasks_total,
  COALESCE(k.tasks_completed, 0)             AS tasks_completed,
  COALESCE(k.tasks_on_time, 0)               AS tasks_on_time,
  r.overall_status                           AS review_status,
  r.locked_at                                AS review_locked_at
FROM email_rollup e
FULL OUTER JOIN task_rollup k
  ON k.subject_uuid = e.subject_uuid
 AND k.period_start = e.period_start
 AND k.period_type  = e.period_type
LEFT JOIN public.kpi_reviews r
  ON r.subject_uuid = COALESCE(e.subject_uuid, k.subject_uuid)
 AND r.kpi_role     = 'cst'
 AND r.period_type  = COALESCE(e.period_type, k.period_type)
 AND r.period_start = COALESCE(e.period_start, k.period_start);

CREATE OR REPLACE VIEW public.v_kpi_dev_summary
WITH (security_invoker = true) AS
WITH ticket_rollup AS (
  SELECT
    t.assignee_uuid                                AS subject_uuid,
    date_trunc('week', t.opened_at)::date          AS period_start,
    'weekly'::text                                 AS period_type,
    COUNT(*)                                       AS tickets_opened,
    COUNT(*) FILTER (WHERE t.resolved_at IS NOT NULL)  AS tickets_resolved,
    COALESCE(SUM(t.reopen_count), 0)               AS reopen_count,
    AVG(EXTRACT(EPOCH FROM (t.first_response_at - t.opened_at)) / 60.0)
      FILTER (WHERE t.first_response_at IS NOT NULL) AS avg_first_response_minutes,
    AVG(EXTRACT(EPOCH FROM (t.resolved_at - t.opened_at)) / 3600.0)
      FILTER (WHERE t.resolved_at IS NOT NULL)       AS avg_resolution_hours
  FROM public.kpi_tickets t
  WHERE t.opened_at IS NOT NULL AND t.assignee_uuid IS NOT NULL
  GROUP BY t.assignee_uuid, date_trunc('week', t.opened_at)
),
milestone_rollup AS (
  SELECT
    m.owner_uuid                                                            AS subject_uuid,
    date_trunc('week', COALESCE(m.delivered_date, m.planned_date))::date    AS period_start,
    'weekly'::text                                                          AS period_type,
    COUNT(*)                                                                AS milestones_total,
    COUNT(*) FILTER (WHERE m.delivered_date IS NOT NULL)                    AS milestones_delivered,
    COUNT(*) FILTER (
      WHERE m.delivered_date IS NOT NULL
        AND m.planned_date  IS NOT NULL
        AND m.delivered_date <= m.planned_date
    )                                                                       AS milestones_on_time
  FROM public.kpi_dev_milestones m
  WHERE m.owner_uuid IS NOT NULL
  GROUP BY m.owner_uuid, date_trunc('week', COALESCE(m.delivered_date, m.planned_date))
)
SELECT
  COALESCE(tr.subject_uuid, mr.subject_uuid)  AS subject_uuid,
  COALESCE(tr.period_start, mr.period_start)  AS period_start,
  COALESCE(tr.period_type, mr.period_type)    AS period_type,
  COALESCE(tr.tickets_opened, 0)              AS tickets_opened,
  COALESCE(tr.tickets_resolved, 0)            AS tickets_resolved,
  COALESCE(tr.reopen_count, 0)                AS reopen_count,
  ROUND(tr.avg_first_response_minutes::numeric, 1) AS avg_first_response_minutes,
  ROUND(tr.avg_resolution_hours::numeric, 2)  AS avg_resolution_hours,
  COALESCE(mr.milestones_total, 0)            AS milestones_total,
  COALESCE(mr.milestones_delivered, 0)        AS milestones_delivered,
  COALESCE(mr.milestones_on_time, 0)          AS milestones_on_time,
  r.overall_status                            AS review_status,
  r.locked_at                                 AS review_locked_at
FROM ticket_rollup tr
FULL OUTER JOIN milestone_rollup mr
  ON mr.subject_uuid = tr.subject_uuid
 AND mr.period_start = tr.period_start
 AND mr.period_type  = tr.period_type
LEFT JOIN public.kpi_reviews r
  ON r.subject_uuid = COALESCE(tr.subject_uuid, mr.subject_uuid)
 AND r.kpi_role     = 'dev'
 AND r.period_type  = COALESCE(tr.period_type, mr.period_type)
 AND r.period_start = COALESCE(tr.period_start, mr.period_start);

GRANT SELECT ON public.v_kpi_csc_summary TO authenticated, service_role;
GRANT SELECT ON public.v_kpi_cst_summary TO authenticated, service_role;
GRANT SELECT ON public.v_kpi_dev_summary TO authenticated, service_role;
