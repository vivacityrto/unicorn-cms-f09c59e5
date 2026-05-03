CREATE OR REPLACE VIEW public.v_client_home_feed
WITH (security_invoker = true) AS
WITH
cai_due_upcoming AS (
  SELECT
    'coming_up'::text                     AS feed_section,
    'task_due'::text                      AS event_type,
    cai.tenant_id::bigint                 AS tenant_id,
    cai.package_id::bigint                AS package_instance_id,
    cai.due_date::timestamptz             AS event_at,
    cai.title                             AS title,
    NULL::text                            AS subtitle,
    cai.id::text                          AS event_uid,
    'client_action_items'::text           AS source_table,
    '/client/tasks'::text                 AS href
  FROM client_action_items cai
  WHERE cai.due_date IS NOT NULL
    AND cai.completed_at IS NULL
    AND COALESCE(cai.status, 'open') NOT IN ('completed', 'cancelled')
    AND cai.due_date >= now()::date
    AND cai.due_date < (now() + interval '84 days')::date
),
cti_due_upcoming AS (
  SELECT
    'coming_up'::text, 'task_due'::text,
    pi.tenant_id::bigint, pi.id::bigint,
    cti.due_date, COALESCE(ct.name, 'Task')::text, NULL::text,
    cti.id::text, 'client_task_instances'::text, '/client/tasks'::text
  FROM client_task_instances cti
  JOIN stage_instances si ON si.id = cti.stageinstance_id
  JOIN package_instances pi ON pi.id = si.packageinstance_id
  LEFT JOIN client_tasks ct ON ct.id = cti.clienttask_id
  WHERE COALESCE(cti.is_archived, false) = false
    AND cti.completion_date IS NULL
    AND COALESCE(cti.status, 0) <> 2
    AND COALESCE(si.released_client_tasks, false) = true
    AND cti.due_date IS NOT NULL
    AND cti.due_date >= now()
    AND cti.due_date < (now() + interval '84 days')
    AND pi.is_complete = false
),
cai_overdue AS (
  SELECT
    'needs_attention'::text, 'task_overdue'::text,
    cai.tenant_id::bigint, cai.package_id::bigint,
    cai.due_date::timestamptz, cai.title, 'Overdue task'::text,
    cai.id::text, 'client_action_items'::text, '/client/tasks'::text
  FROM client_action_items cai
  WHERE cai.due_date IS NOT NULL
    AND cai.completed_at IS NULL
    AND COALESCE(cai.status, 'open') NOT IN ('completed', 'cancelled')
    AND cai.due_date < now()::date
),
cti_overdue AS (
  SELECT
    'needs_attention'::text, 'task_overdue'::text,
    pi.tenant_id::bigint, pi.id::bigint,
    cti.due_date, COALESCE(ct.name, 'Task')::text, 'Overdue task'::text,
    cti.id::text, 'client_task_instances'::text, '/client/tasks'::text
  FROM client_task_instances cti
  JOIN stage_instances si ON si.id = cti.stageinstance_id
  JOIN package_instances pi ON pi.id = si.packageinstance_id
  LEFT JOIN client_tasks ct ON ct.id = cti.clienttask_id
  WHERE COALESCE(cti.is_archived, false) = false
    AND cti.completion_date IS NULL
    AND COALESCE(cti.status, 0) <> 2
    AND COALESCE(si.released_client_tasks, false) = true
    AND cti.due_date IS NOT NULL
    AND cti.due_date < now()
    AND pi.is_complete = false
),
urgent_notes AS (
  SELECT
    'needs_attention'::text, 'urgent_note'::text,
    n.tenant_id::bigint, n.parent_id::bigint,
    n.updated_at,
    COALESCE(n.title, 'Urgent note')::text, NULL::text,
    n.id::text, 'notes'::text, '/client/packages'::text
  FROM notes n
  JOIN package_instances pi ON pi.id = n.parent_id
  WHERE n.parent_type = 'package_instance'
    AND COALESCE(n.is_pinned, false) = true
    AND pi.is_complete = false
    AND lower(COALESCE(n.note_details, '') || ' ' || COALESCE(n.title, ''))
        ~ '(urgent|overdue|action required)'
),
te_recent AS (
  SELECT
    'recent_activity'::text, 'consult_logged'::text,
    pi.tenant_id::bigint, pi.id::bigint,
    te.start_at,
    COALESCE(NULLIF(TRIM(te.work_type), ''), 'Other')::text,
    NULLIF(TRIM(te.work_sub_type), '')::text,
    te.id::text, 'time_entries'::text, '/client/packages'::text
  FROM time_entries te
  JOIN package_instances pi ON pi.id = te.package_instance_id
  WHERE te.duration_minutes IS NOT NULL
    AND te.duration_minutes > 0
    AND te.start_at >= now() - interval '30 days'
    AND (pi.start_date IS NULL OR te.start_at >= pi.start_date)
    AND pi.is_complete = false
),
stages_completed_recent AS (
  SELECT
    'recent_activity'::text, 'stage_completed'::text,
    pi.tenant_id::bigint, pi.id::bigint,
    si.status_date,
    COALESCE(NULLIF(TRIM(s.shortname), ''), s.name)::text,
    'Stage complete'::text,
    si.id::text, 'stage_instances'::text, '/client/packages'::text
  FROM stage_instances si
  JOIN package_instances pi ON pi.id = si.packageinstance_id
  JOIN stages s ON s.id = si.stage_id
  WHERE si.status_id IN (2, 3)
    AND si.status_date IS NOT NULL
    AND si.status_date >= now() - interval '30 days'
    AND COALESCE(s.is_archived, false) = false
    AND COALESCE(s.is_audit_workspace, false) = false
    AND pi.is_complete = false
),
stages_released_recent AS (
  SELECT
    'recent_activity'::text, 'stage_released'::text,
    pi.tenant_id::bigint, pi.id::bigint,
    si.released_client_tasks_date::timestamptz,
    COALESCE(NULLIF(TRIM(s.shortname), ''), s.name)::text,
    'Stage released'::text,
    si.id::text, 'stage_instances'::text, '/client/packages'::text
  FROM stage_instances si
  JOIN package_instances pi ON pi.id = si.packageinstance_id
  JOIN stages s ON s.id = si.stage_id
  WHERE COALESCE(si.released_client_tasks, false) = true
    AND si.released_client_tasks_date IS NOT NULL
    AND si.released_client_tasks_date >= now() - interval '30 days'
    AND COALESCE(s.is_archived, false) = false
    AND COALESCE(s.is_audit_workspace, false) = false
    AND pi.is_complete = false
),
cai_completed_recent AS (
  SELECT
    'recent_activity'::text, 'task_completed'::text,
    cai.tenant_id::bigint, cai.package_id::bigint,
    cai.completed_at, cai.title, 'Task completed'::text,
    cai.id::text, 'client_action_items'::text, '/client/tasks'::text
  FROM client_action_items cai
  WHERE cai.completed_at IS NOT NULL
    AND cai.completed_at >= now() - interval '30 days'
)
SELECT
  feed_section, event_type, tenant_id, package_instance_id,
  event_at, title, subtitle, event_uid, source_table, href
FROM (
  SELECT * FROM cai_due_upcoming
  UNION ALL SELECT * FROM cti_due_upcoming
  UNION ALL SELECT * FROM cai_overdue
  UNION ALL SELECT * FROM cti_overdue
  UNION ALL SELECT * FROM urgent_notes
  UNION ALL SELECT * FROM te_recent
  UNION ALL SELECT * FROM stages_completed_recent
  UNION ALL SELECT * FROM stages_released_recent
  UNION ALL SELECT * FROM cai_completed_recent
) all_events
WHERE event_at IS NOT NULL;

GRANT SELECT ON public.v_client_home_feed TO authenticated;

COMMENT ON VIEW public.v_client_home_feed IS
  'Cross-package home feed for the client portal Home page. Three feed_sections from one '
  'UNION: "coming_up" (next 12 weeks task due dates), "needs_attention" (overdue/urgent), '
  '"recent_activity" (last 30 days). Strictly client-facing - no eos_* tables, no meetings '
  'table, no staff attribution. security_invoker=true.';