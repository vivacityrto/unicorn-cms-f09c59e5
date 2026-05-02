-- =============================================================
-- Patch 1: v_client_package_dashboard
-- - stage_agg: stages_complete + current_stage_sortorder use status_id IN (2,3)
-- - task_instances_agg: gate on stage_instances.released_client_tasks = true
-- All other columns, joins, and CTE names preserved exactly.
-- =============================================================
CREATE OR REPLACE VIEW public.v_client_package_dashboard
WITH (security_invoker = true)
AS
WITH stage_agg AS (
  SELECT si.packageinstance_id AS package_instance_id,
    count(*)::integer AS stages_total,
    count(*) FILTER (WHERE si.status_id IN (2, 3))::integer AS stages_complete,
    min(si.stage_sortorder) FILTER (WHERE si.status_id IS NULL OR si.status_id NOT IN (2, 3)) AS current_stage_sortorder,
    max(si.updated_at) AS stage_last_updated
  FROM stage_instances si
  GROUP BY si.packageinstance_id
), action_items_agg AS (
  SELECT cai.package_id AS package_instance_id,
    count(*)::integer AS open_count,
    count(*) FILTER (WHERE cai.due_date < now()::date)::integer AS overdue_count,
    max(cai.updated_at) AS last_updated
  FROM client_action_items cai
  WHERE cai.package_id IS NOT NULL
    AND cai.completed_at IS NULL
    AND (COALESCE(cai.status, 'open'::text) <> ALL (ARRAY['completed'::text, 'cancelled'::text]))
  GROUP BY cai.package_id
), task_instances_agg AS (
  SELECT si.packageinstance_id AS package_instance_id,
    count(*)::integer AS open_count,
    count(*) FILTER (WHERE cti.due_date < now())::integer AS overdue_count,
    max(cti.updated_at) AS last_updated
  FROM client_task_instances cti
    JOIN stage_instances si ON si.id = cti.stageinstance_id
  WHERE COALESCE(cti.is_archived, false) = false
    AND cti.completion_date IS NULL
    AND COALESCE(cti.status, 0) <> 2
    AND COALESCE(si.released_client_tasks, false) = true   -- NEW: only count released-to-client tasks
  GROUP BY si.packageinstance_id
), tasks_agg AS (
  SELECT COALESCE(a.package_instance_id, t.package_instance_id) AS package_instance_id,
    COALESCE(a.open_count, 0) + COALESCE(t.open_count, 0) AS open_tasks,
    COALESCE(a.overdue_count, 0) + COALESCE(t.overdue_count, 0) AS overdue_tasks,
    GREATEST(a.last_updated, t.last_updated) AS tasks_last_updated
  FROM action_items_agg a
    FULL JOIN task_instances_agg t ON t.package_instance_id = a.package_instance_id
), notes_agg AS (
  SELECT n.parent_id AS package_instance_id,
    max(n.updated_at) AS notes_last_updated
  FROM notes n
  WHERE n.parent_type = 'package_instance'::text AND n.parent_id IS NOT NULL
  GROUP BY n.parent_id
), pinned AS (
  SELECT DISTINCT ON (n.parent_id) n.parent_id AS package_instance_id,
    n.title AS pinned_note_title,
    n.note_details AS pinned_note_text,
    n.priority AS pinned_note_priority,
    n.updated_at AS pinned_note_updated_at
  FROM notes n
  WHERE n.parent_type = 'package_instance'::text AND n.is_pinned = true AND n.parent_id IS NOT NULL
  ORDER BY n.parent_id, n.updated_at DESC NULLS LAST
)
SELECT pi.id AS package_instance_id,
  pi.tenant_id,
  p.name AS package_name,
  p.package_type,
  p.progress_mode,
  pi.manager_id,
  pi.is_complete,
  pi.start_date,
  pi.end_date,
  COALESCE(pi.hours_included, 0) AS hours_included,
  COALESCE(pi.hours_added, 0) AS hours_added,
  (COALESCE(pi.hours_included, 0) + COALESCE(pi.hours_added, 0))::numeric AS hours_total,
  COALESCE(pi.hours_used, 0::numeric) AS hours_used,
  GREATEST((COALESCE(pi.hours_included, 0) + COALESCE(pi.hours_added, 0))::numeric - COALESCE(pi.hours_used, 0::numeric), 0::numeric) AS hours_remaining,
  CASE
    WHEN (COALESCE(pi.hours_included, 0) + COALESCE(pi.hours_added, 0)) = 0 THEN 0::numeric
    ELSE round(COALESCE(pi.hours_used, 0::numeric) / (COALESCE(pi.hours_included, 0) + COALESCE(pi.hours_added, 0))::numeric, 4)
  END AS hours_pct_used,
  COALESCE(sa.stages_total, 0) AS stages_total,
  COALESCE(sa.stages_complete, 0) AS stages_complete,
  sa.current_stage_sortorder,
  COALESCE(ta.open_tasks, 0) AS open_tasks,
  COALESCE(ta.overdue_tasks, 0) AS overdue_tasks,
  GREATEST(na.notes_last_updated, sa.stage_last_updated, ta.tasks_last_updated) AS last_activity_at,
  pn.pinned_note_title,
  pn.pinned_note_text,
  pn.pinned_note_priority,
  pn.pinned_note_updated_at,
  CASE
    WHEN pn.pinned_note_text IS NULL AND pn.pinned_note_title IS NULL THEN NULL::text
    WHEN lower((COALESCE(pn.pinned_note_text, ''::text) || ' '::text) || COALESCE(pn.pinned_note_title, ''::text)) ~~ '%on hold%'::text THEN 'hold'::text
    WHEN lower((COALESCE(pn.pinned_note_text, ''::text) || ' '::text) || COALESCE(pn.pinned_note_title, ''::text)) ~ '(urgent|overdue)'::text THEN 'urgent'::text
    ELSE 'info'::text
  END AS pinned_note_severity,
  CASE
    WHEN pn.pinned_note_text IS NOT NULL AND lower((COALESCE(pn.pinned_note_text, ''::text) || ' '::text) || COALESCE(pn.pinned_note_title, ''::text)) ~~ '%on hold%'::text THEN 'on_hold'::text
    WHEN pi.is_complete = true THEN 'complete'::text
    WHEN GREATEST(na.notes_last_updated, sa.stage_last_updated, ta.tasks_last_updated) < (now() - '30 days'::interval) OR (COALESCE(pi.hours_included, 0) + COALESCE(pi.hours_added, 0)) > 0 AND (COALESCE(pi.hours_used, 0::numeric) / (COALESCE(pi.hours_included, 0) + COALESCE(pi.hours_added, 0))::numeric) >= 0.95 THEN 'stuck'::text
    WHEN GREATEST(na.notes_last_updated, sa.stage_last_updated, ta.tasks_last_updated) < (now() - '14 days'::interval) OR (COALESCE(pi.hours_included, 0) + COALESCE(pi.hours_added, 0)) > 0 AND (COALESCE(pi.hours_used, 0::numeric) / (COALESCE(pi.hours_included, 0) + COALESCE(pi.hours_added, 0))::numeric) >= 0.75 OR COALESCE(ta.overdue_tasks, 0) > 0 THEN 'drifting'::text
    ELSE 'on_track'::text
  END AS status_pill
FROM package_instances pi
  JOIN packages p ON p.id = pi.package_id
  LEFT JOIN stage_agg sa ON sa.package_instance_id = pi.id
  LEFT JOIN tasks_agg ta ON ta.package_instance_id = pi.id
  LEFT JOIN notes_agg na ON na.package_instance_id = pi.id
  LEFT JOIN pinned pn ON pn.package_instance_id = pi.id;

COMMENT ON VIEW public.v_client_package_dashboard IS
  'Client-portal package dashboard payload. Strictly additive. '
  'Stage completion uses status_id IN (2,3) per v_phase_progress_summary. '
  'Tasks count only released client tasks (released_client_tasks=true) plus action items. '
  'Pinned notes from public.notes (parent_type=package_instance). '
  'Hours from package_instances.hours_used (pre-aggregated). '
  'security_invoker=true delegates RLS to underlying tables. '
  'Companion hook: src/hooks/use-client-package-dashboard.ts.';

-- =============================================================
-- Patch 2: v_client_package_stages
-- - node_state uses status_id IN (2,3) for "complete" and lowest open by same rule for "current".
-- All other columns, joins, and filters preserved exactly.
-- =============================================================
CREATE OR REPLACE VIEW public.v_client_package_stages
WITH (security_invoker = true)
AS
SELECT pi.id AS package_instance_id,
  pi.tenant_id,
  si.id AS stage_instance_id,
  s.id AS stage_id,
  si.stage_sortorder,
  s.name AS stage_name,
  COALESCE(NULLIF(TRIM(BOTH FROM s.shortname), ''::text), s.name) AS stage_shortname,
  s.description AS stage_description,
  s.is_recurring,
  COALESCE(s.is_audit_workspace, false) AS is_audit_workspace,
  si.completion_date,
  si.status AS raw_status,
  COALESCE(si.released_client_tasks, false) AS released_client_tasks,
  si.released_client_tasks_date,
  si.event_conducted_date,
  si.updated_at,
  CASE
    WHEN si.status_id IN (2, 3) THEN 'complete'::text
    WHEN si.id = (
      SELECT si2.id
      FROM stage_instances si2
        JOIN stages s2 ON s2.id = si2.stage_id
      WHERE si2.packageinstance_id = pi.id
        AND (si2.status_id IS NULL OR si2.status_id NOT IN (2, 3))
        AND COALESCE(s2.is_archived, false) = false
        AND COALESCE(s2.is_audit_workspace, false) = false
      ORDER BY si2.stage_sortorder
      LIMIT 1
    ) THEN 'current'::text
    ELSE 'future'::text
  END AS node_state
FROM package_instances pi
  JOIN stage_instances si ON si.packageinstance_id = pi.id
  JOIN stages s ON s.id = si.stage_id
WHERE COALESCE(s.is_archived, false) = false
  AND COALESCE(s.is_audit_workspace, false) = false;

COMMENT ON VIEW public.v_client_package_stages IS
  'Client-portal stage journey for a package_instance. Strictly additive. '
  'Excludes archived stages and audit workspaces. '
  'node_state uses status_id IN (2,3) per v_phase_progress_summary: '
  'complete | current (lowest open) | future.';