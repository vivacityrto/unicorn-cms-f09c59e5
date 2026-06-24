-- Migrate any existing rows
UPDATE public.kpi_reviews SET kpi_role = 'csc_consultant' WHERE kpi_role = 'csc';
UPDATE public.kpi_reviews SET kpi_role = 'cst_assistant'  WHERE kpi_role = 'cst';
UPDATE public.kpi_reviews SET kpi_role = 'developer'      WHERE kpi_role = 'dev';

-- Rebuild views to join kpi_reviews on the new role values
DROP VIEW IF EXISTS public.v_kpi_csc_summary;
CREATE VIEW public.v_kpi_csc_summary
WITH (security_invoker = true) AS
SELECT
  el.user_uuid                                          AS subject_uuid,
  date_trunc('week', el.received_at)::date              AS period_start,
  'weekly'::text                                        AS period_type,
  count(*)                                              AS email_total,
  count(*) FILTER (WHERE el.sla_met = true)             AS email_sla_met,
  round(
    CASE WHEN count(*) > 0
      THEN count(*) FILTER (WHERE el.sla_met = true)::numeric
           / count(*)::numeric * 100
      ELSE 0
    END, 2)                                             AS email_sla_pct,
  r.overall_status                                      AS review_status,
  r.locked_at                                           AS review_locked_at
FROM public.kpi_email_log el
LEFT JOIN public.kpi_reviews r
  ON  r.subject_uuid = el.user_uuid
  AND r.kpi_role     = 'csc_consultant'
  AND r.period_type  = 'weekly'
  AND r.period_start = date_trunc('week', el.received_at)::date
WHERE el.received_at IS NOT NULL
  AND el.user_uuid   IS NOT NULL
GROUP BY el.user_uuid,
         date_trunc('week', el.received_at),
         r.overall_status,
         r.locked_at;

CREATE OR REPLACE VIEW public.v_kpi_cst_summary
WITH (security_invoker = true) AS
WITH email_rollup AS (
  SELECT el.user_uuid AS subject_uuid,
    date_trunc('week'::text, el.received_at)::date AS period_start,
    'weekly'::text AS period_type,
    count(*) FILTER (WHERE el.email_type = 'general_email'::text) AS sla1_total,
    count(*) FILTER (WHERE el.email_type = 'general_email'::text AND el.sla_met IS TRUE) AS sla1_met,
    count(*) FILTER (WHERE el.email_type = 'client_message'::text) AS sla2_total,
    count(*) FILTER (WHERE el.email_type = 'client_message'::text AND el.sla_met IS TRUE) AS sla2_met,
    avg(el.response_minutes) FILTER (WHERE el.email_type = 'general_email'::text) AS sla1_avg_minutes,
    avg(el.response_minutes) FILTER (WHERE el.email_type = 'client_message'::text) AS sla2_avg_minutes
  FROM public.kpi_email_log el
  WHERE el.received_at IS NOT NULL AND el.user_uuid IS NOT NULL
  GROUP BY el.user_uuid, date_trunc('week'::text, el.received_at)
), task_rollup AS (
  SELECT t.assignee_uuid AS subject_uuid,
    date_trunc('week'::text, COALESCE(t.completed_at, t.created_at))::date AS period_start,
    'weekly'::text AS period_type,
    count(*) AS tasks_total,
    count(*) FILTER (WHERE t.completed_at IS NOT NULL) AS tasks_completed,
    count(*) FILTER (WHERE t.status IN ('done_on_time', 'rectified')) AS tasks_on_time
  FROM public.kpi_tasks t
  WHERE t.assignee_uuid IS NOT NULL
  GROUP BY t.assignee_uuid, date_trunc('week'::text, COALESCE(t.completed_at, t.created_at))
)
SELECT COALESCE(e.subject_uuid, k.subject_uuid) AS subject_uuid,
  COALESCE(e.period_start, k.period_start) AS period_start,
  COALESCE(e.period_type, k.period_type) AS period_type,
  COALESCE(e.sla1_total, 0::bigint) AS sla1_total,
  COALESCE(e.sla1_met, 0::bigint) AS sla1_met,
  round(CASE WHEN COALESCE(e.sla1_total, 0::bigint) > 0
    THEN e.sla1_met::numeric / e.sla1_total::numeric * 100::numeric
    ELSE 0::numeric END, 2) AS sla1_pct,
  round(e.sla1_avg_minutes, 1) AS sla1_avg_minutes,
  COALESCE(e.sla2_total, 0::bigint) AS sla2_total,
  COALESCE(e.sla2_met, 0::bigint) AS sla2_met,
  round(CASE WHEN COALESCE(e.sla2_total, 0::bigint) > 0
    THEN e.sla2_met::numeric / e.sla2_total::numeric * 100::numeric
    ELSE 0::numeric END, 2) AS sla2_pct,
  round(e.sla2_avg_minutes, 1) AS sla2_avg_minutes,
  COALESCE(k.tasks_total, 0::bigint) AS tasks_total,
  COALESCE(k.tasks_completed, 0::bigint) AS tasks_completed,
  COALESCE(k.tasks_on_time, 0::bigint) AS tasks_on_time,
  r.overall_status AS review_status,
  r.locked_at AS review_locked_at
FROM email_rollup e
FULL JOIN task_rollup k ON k.subject_uuid = e.subject_uuid AND k.period_start = e.period_start AND k.period_type = e.period_type
LEFT JOIN public.kpi_reviews r ON r.subject_uuid = COALESCE(e.subject_uuid, k.subject_uuid)
  AND r.kpi_role = 'cst_assistant'::text
  AND r.period_type = COALESCE(e.period_type, k.period_type)
  AND r.period_start = COALESCE(e.period_start, k.period_start);

CREATE OR REPLACE VIEW public.v_kpi_dev_summary
WITH (security_invoker = true) AS
WITH ticket_rollup AS (
  SELECT t.assignee_uuid AS subject_uuid,
    date_trunc('week'::text, t.opened_at)::date AS period_start,
    'weekly'::text AS period_type,
    count(*) AS tickets_opened,
    count(*) FILTER (WHERE t.resolved_at IS NOT NULL) AS tickets_resolved,
    COALESCE(sum(t.reopen_count), 0::bigint) AS reopen_count,
    avg(EXTRACT(epoch FROM t.first_response_at - t.opened_at) / 60.0) FILTER (WHERE t.first_response_at IS NOT NULL) AS avg_first_response_minutes,
    avg(EXTRACT(epoch FROM t.resolved_at - t.opened_at) / 3600.0) FILTER (WHERE t.resolved_at IS NOT NULL) AS avg_resolution_hours
  FROM public.kpi_tickets t
  WHERE t.opened_at IS NOT NULL AND t.assignee_uuid IS NOT NULL
  GROUP BY t.assignee_uuid, date_trunc('week'::text, t.opened_at)
), milestone_rollup AS (
  SELECT m.owner_uuid AS subject_uuid,
    date_trunc('week'::text, COALESCE(m.delivered_date, m.planned_date)::timestamp with time zone)::date AS period_start,
    'weekly'::text AS period_type,
    count(*) AS milestones_total,
    count(*) FILTER (WHERE m.delivered_date IS NOT NULL) AS milestones_delivered,
    count(*) FILTER (WHERE m.delivered_date IS NOT NULL AND m.planned_date IS NOT NULL AND m.delivered_date <= m.planned_date) AS milestones_on_time
  FROM public.kpi_dev_milestones m
  WHERE m.owner_uuid IS NOT NULL
  GROUP BY m.owner_uuid, date_trunc('week'::text, COALESCE(m.delivered_date, m.planned_date)::timestamp with time zone)
)
SELECT COALESCE(tr.subject_uuid, mr.subject_uuid) AS subject_uuid,
  COALESCE(tr.period_start, mr.period_start) AS period_start,
  COALESCE(tr.period_type, mr.period_type) AS period_type,
  COALESCE(tr.tickets_opened, 0::bigint) AS tickets_opened,
  COALESCE(tr.tickets_resolved, 0::bigint) AS tickets_resolved,
  COALESCE(tr.reopen_count, 0::bigint) AS reopen_count,
  round(tr.avg_first_response_minutes, 1) AS avg_first_response_minutes,
  round(tr.avg_resolution_hours, 2) AS avg_resolution_hours,
  COALESCE(mr.milestones_total, 0::bigint) AS milestones_total,
  COALESCE(mr.milestones_delivered, 0::bigint) AS milestones_delivered,
  COALESCE(mr.milestones_on_time, 0::bigint) AS milestones_on_time,
  r.overall_status AS review_status,
  r.locked_at AS review_locked_at
FROM ticket_rollup tr
FULL JOIN milestone_rollup mr ON mr.subject_uuid = tr.subject_uuid AND mr.period_start = tr.period_start AND mr.period_type = tr.period_type
LEFT JOIN public.kpi_reviews r ON r.subject_uuid = COALESCE(tr.subject_uuid, mr.subject_uuid)
  AND r.kpi_role = 'developer'::text
  AND r.period_type = COALESCE(tr.period_type, mr.period_type)
  AND r.period_start = COALESCE(tr.period_start, mr.period_start);

-- Update compute_kpi_overall_status: accept new role values, apply 80% CSC threshold
CREATE OR REPLACE FUNCTION public.compute_kpi_overall_status(p_kpi_role text, p_subject_uuid uuid, p_period_start date, p_period_end date)
 RETURNS TABLE(overall_status text, metrics jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_min_pct numeric;
  v_metrics jsonb := '{}'::jsonb;
  v_status  text;
BEGIN
  IF p_kpi_role NOT IN ('csc_consultant','cst_assistant','developer') THEN
    RAISE EXCEPTION 'Invalid kpi_role: %', p_kpi_role;
  END IF;

  IF p_kpi_role = 'csc_consultant' THEN
    SELECT
      jsonb_build_object(
        'email_total',   COALESCE(SUM(email_total), 0),
        'email_sla_met', COALESCE(SUM(email_sla_met), 0),
        'email_sla_pct',
          CASE WHEN COALESCE(SUM(email_total),0) > 0
               THEN ROUND((SUM(email_sla_met)::numeric / SUM(email_total)) * 100, 2)
               ELSE NULL END
      ),
      CASE WHEN COALESCE(SUM(email_total),0) > 0
           THEN (SUM(email_sla_met)::numeric / SUM(email_total)) * 100
           ELSE NULL END
    INTO v_metrics, v_min_pct
    FROM public.v_kpi_csc_summary
    WHERE subject_uuid = p_subject_uuid
      AND period_start >= p_period_start
      AND period_start <= p_period_end;

    -- CSC grading: target 80% email SLA
    IF v_min_pct IS NULL THEN
      v_status := NULL;
    ELSIF v_min_pct >= 80 THEN
      v_status := 'on_track';
    ELSIF v_min_pct >= 72 THEN
      v_status := 'at_risk';
    ELSE
      v_status := 'off_track';
    END IF;

    overall_status := v_status;
    metrics        := COALESCE(v_metrics, '{}'::jsonb);
    RETURN NEXT;
    RETURN;

  ELSIF p_kpi_role = 'cst_assistant' THEN
    WITH agg AS (
      SELECT
        COALESCE(SUM(sla1_total),0)     AS sla1_total,
        COALESCE(SUM(sla1_met),0)       AS sla1_met,
        COALESCE(SUM(sla2_total),0)     AS sla2_total,
        COALESCE(SUM(sla2_met),0)       AS sla2_met,
        COALESCE(SUM(tasks_total),0)    AS tasks_total,
        COALESCE(SUM(tasks_completed),0)AS tasks_completed,
        COALESCE(SUM(tasks_on_time),0)  AS tasks_on_time
      FROM public.v_kpi_cst_summary
      WHERE subject_uuid = p_subject_uuid
        AND period_start >= p_period_start
        AND period_start <= p_period_end
    ),
    pcts AS (
      SELECT
        CASE WHEN sla1_total > 0 THEN (sla1_met::numeric / sla1_total) * 100 END AS sla1_pct,
        CASE WHEN sla2_total > 0 THEN (sla2_met::numeric / sla2_total) * 100 END AS sla2_pct,
        CASE WHEN tasks_total > 0 THEN (tasks_completed::numeric / tasks_total) * 100 END AS tasks_complete_pct,
        CASE WHEN tasks_completed > 0 THEN (tasks_on_time::numeric / tasks_completed) * 100 END AS tasks_on_time_pct,
        sla1_total, sla1_met, sla2_total, sla2_met, tasks_total, tasks_completed, tasks_on_time
      FROM agg
    )
    SELECT
      jsonb_build_object(
        'sla1_total', sla1_total, 'sla1_met', sla1_met,
        'sla1_pct',   ROUND(sla1_pct, 2),
        'sla2_total', sla2_total, 'sla2_met', sla2_met,
        'sla2_pct',   ROUND(sla2_pct, 2),
        'tasks_total', tasks_total,
        'tasks_completed', tasks_completed,
        'tasks_on_time',   tasks_on_time,
        'tasks_complete_pct', ROUND(tasks_complete_pct, 2),
        'tasks_on_time_pct', ROUND(tasks_on_time_pct, 2)
      ),
      LEAST(
        COALESCE(sla1_pct,   999),
        COALESCE(sla2_pct,   999),
        COALESCE(tasks_complete_pct, 999),
        COALESCE(tasks_on_time_pct,  999)
      )
    INTO v_metrics, v_min_pct
    FROM pcts;
    IF v_min_pct = 999 THEN v_min_pct := NULL; END IF;

  ELSE -- developer
    WITH agg AS (
      SELECT
        COALESCE(SUM(tickets_opened),0)       AS tickets_opened,
        COALESCE(SUM(tickets_resolved),0)     AS tickets_resolved,
        COALESCE(SUM(reopen_count),0)         AS reopen_count,
        COALESCE(SUM(milestones_total),0)     AS milestones_total,
        COALESCE(SUM(milestones_delivered),0) AS milestones_delivered,
        COALESCE(SUM(milestones_on_time),0)   AS milestones_on_time
      FROM public.v_kpi_dev_summary
      WHERE subject_uuid = p_subject_uuid
        AND period_start >= p_period_start
        AND period_start <= p_period_end
    ),
    pcts AS (
      SELECT
        CASE WHEN tickets_opened > 0
             THEN (tickets_resolved::numeric / tickets_opened) * 100 END AS resolution_pct,
        CASE WHEN milestones_total > 0
             THEN (milestones_on_time::numeric / milestones_total) * 100 END AS milestone_on_time_pct,
        CASE WHEN tickets_opened > 0
             THEN GREATEST(0, 100 - ((reopen_count::numeric / tickets_opened) * 250))
             END AS quality_pct,
        tickets_opened, tickets_resolved, reopen_count,
        milestones_total, milestones_delivered, milestones_on_time
      FROM agg
    )
    SELECT
      jsonb_build_object(
        'tickets_opened', tickets_opened,
        'tickets_resolved', tickets_resolved,
        'reopen_count', reopen_count,
        'resolution_pct', ROUND(resolution_pct, 2),
        'quality_pct',    ROUND(quality_pct, 2),
        'milestones_total', milestones_total,
        'milestones_delivered', milestones_delivered,
        'milestones_on_time',   milestones_on_time,
        'milestone_on_time_pct', ROUND(milestone_on_time_pct, 2)
      ),
      LEAST(
        COALESCE(resolution_pct,        999),
        COALESCE(milestone_on_time_pct, 999),
        COALESCE(quality_pct,           999)
      )
    INTO v_metrics, v_min_pct
    FROM pcts;
    IF v_min_pct = 999 THEN v_min_pct := NULL; END IF;
  END IF;

  -- Non-CSC grading (legacy thresholds)
  IF v_min_pct IS NULL THEN
    v_status := NULL;
  ELSIF v_min_pct >= 95 THEN
    v_status := 'exceeds';
  ELSIF v_min_pct >= 85 THEN
    v_status := 'on_track';
  ELSIF v_min_pct >= 70 THEN
    v_status := 'at_risk';
  ELSE
    v_status := 'off_track';
  END IF;

  overall_status := v_status;
  metrics        := COALESCE(v_metrics, '{}'::jsonb);
  RETURN NEXT;
END;
$function$;