-- =========================================================================
-- v_client_package_dashboard
-- Purpose: One row per package_instance for the client portal /packages page.
-- Pinned-note source: public.notes (parent_type='package_instance', is_pinned=true).
-- Activity source: greatest(notes.updated_at, stage_instances.updated_at,
--                           client_action_items.updated_at) — keyed off the package.
-- Security: security_invoker = true. RLS on the underlying tables is enforced
--           per-caller. Callers MUST also pass an explicit tenant_id filter
--           (staff bypass tenant RLS via get_current_user_tenant_id()).
-- Date: 2026-05-02
-- =========================================================================

CREATE OR REPLACE VIEW public.v_client_package_dashboard
WITH (security_invoker = true) AS
WITH stage_agg AS (
  SELECT
    si.packageinstance_id                                                 AS package_instance_id,
    count(*)::int                                                         AS stages_total,
    count(*) FILTER (WHERE si.completion_date IS NOT NULL)::int           AS stages_complete,
    min(si.stage_sortorder) FILTER (WHERE si.completion_date IS NULL)::int AS current_stage_sortorder,
    max(si.updated_at)                                                    AS stage_last_updated
  FROM public.stage_instances si
  GROUP BY si.packageinstance_id
),
action_items_agg AS (
  SELECT
    cai.package_id::bigint                                                AS package_instance_id,
    count(*)::int                                                         AS open_count,
    count(*) FILTER (WHERE cai.due_date < now()::date)::int               AS overdue_count,
    max(cai.updated_at)                                                   AS last_updated
  FROM public.client_action_items cai
  WHERE cai.package_id IS NOT NULL
    AND cai.completed_at IS NULL
    AND coalesce(cai.status, 'open') NOT IN ('completed', 'cancelled')
  GROUP BY cai.package_id
),
task_instances_agg AS (
  SELECT
    si.packageinstance_id                                                 AS package_instance_id,
    count(*)::int                                                         AS open_count,
    count(*) FILTER (WHERE cti.due_date < now())::int                     AS overdue_count,
    max(cti.updated_at)                                                   AS last_updated
  FROM public.client_task_instances cti
  JOIN public.stage_instances si ON si.id = cti.stageinstance_id
  WHERE coalesce(cti.is_archived, false) = false
    AND cti.completion_date IS NULL
    AND coalesce(cti.status, 0) <> 2
  GROUP BY si.packageinstance_id
),
tasks_agg AS (
  SELECT
    coalesce(a.package_instance_id, t.package_instance_id)                AS package_instance_id,
    coalesce(a.open_count, 0) + coalesce(t.open_count, 0)                 AS open_tasks,
    coalesce(a.overdue_count, 0) + coalesce(t.overdue_count, 0)           AS overdue_tasks,
    greatest(a.last_updated, t.last_updated)                              AS tasks_last_updated
  FROM action_items_agg a
  FULL OUTER JOIN task_instances_agg t
    ON t.package_instance_id = a.package_instance_id
),
notes_agg AS (
  SELECT
    n.parent_id                                                           AS package_instance_id,
    max(n.updated_at)                                                     AS notes_last_updated
  FROM public.notes n
  WHERE n.parent_type = 'package_instance'
    AND n.parent_id IS NOT NULL
  GROUP BY n.parent_id
),
pinned AS (
  SELECT DISTINCT ON (n.parent_id)
    n.parent_id                                                           AS package_instance_id,
    n.title                                                               AS pinned_note_title,
    n.note_details                                                        AS pinned_note_text,
    n.priority                                                            AS pinned_note_priority,
    n.updated_at                                                          AS pinned_note_updated_at
  FROM public.notes n
  WHERE n.parent_type = 'package_instance'
    AND n.is_pinned = true
    AND n.parent_id IS NOT NULL
  ORDER BY n.parent_id, n.updated_at DESC NULLS LAST
)
SELECT
  pi.id                                                                   AS package_instance_id,
  pi.tenant_id::bigint                                                    AS tenant_id,
  p.name                                                                  AS package_name,
  p.package_type                                                          AS package_type,
  p.progress_mode                                                         AS progress_mode,
  pi.manager_id                                                           AS manager_id,
  pi.is_complete                                                          AS is_complete,
  pi.start_date                                                           AS start_date,
  pi.end_date                                                             AS end_date,

  -- hours
  coalesce(pi.hours_included, 0)                                          AS hours_included,
  coalesce(pi.hours_added, 0)                                             AS hours_added,
  (coalesce(pi.hours_included, 0) + coalesce(pi.hours_added, 0))::numeric AS hours_total,
  coalesce(pi.hours_used, 0)::numeric                                     AS hours_used,
  greatest(
    (coalesce(pi.hours_included, 0) + coalesce(pi.hours_added, 0))::numeric
      - coalesce(pi.hours_used, 0)::numeric,
    0
  )                                                                       AS hours_remaining,
  CASE
    WHEN (coalesce(pi.hours_included, 0) + coalesce(pi.hours_added, 0)) = 0 THEN 0::numeric
    ELSE round(
      coalesce(pi.hours_used, 0)::numeric
      / (coalesce(pi.hours_included, 0) + coalesce(pi.hours_added, 0))::numeric,
      4
    )
  END                                                                     AS hours_pct_used,

  -- stages
  coalesce(sa.stages_total, 0)                                            AS stages_total,
  coalesce(sa.stages_complete, 0)                                         AS stages_complete,
  sa.current_stage_sortorder                                              AS current_stage_sortorder,

  -- tasks
  coalesce(ta.open_tasks, 0)                                              AS open_tasks,
  coalesce(ta.overdue_tasks, 0)                                           AS overdue_tasks,

  -- activity
  greatest(na.notes_last_updated, sa.stage_last_updated, ta.tasks_last_updated)
                                                                          AS last_activity_at,

  -- pinned note
  pn.pinned_note_title,
  pn.pinned_note_text,
  pn.pinned_note_priority,
  pn.pinned_note_updated_at,
  CASE
    WHEN pn.pinned_note_text IS NULL AND pn.pinned_note_title IS NULL THEN NULL
    WHEN lower(coalesce(pn.pinned_note_text, '') || ' ' || coalesce(pn.pinned_note_title, ''))
         LIKE '%on hold%' THEN 'hold'
    WHEN lower(coalesce(pn.pinned_note_text, '') || ' ' || coalesce(pn.pinned_note_title, ''))
         ~ '(urgent|overdue)' THEN 'urgent'
    ELSE 'info'
  END                                                                     AS pinned_note_severity,

  -- status pill — order matters
  CASE
    WHEN pn.pinned_note_text IS NOT NULL
         AND lower(coalesce(pn.pinned_note_text, '') || ' ' || coalesce(pn.pinned_note_title, ''))
             LIKE '%on hold%'
      THEN 'on_hold'
    WHEN pi.is_complete = true THEN 'complete'
    WHEN greatest(na.notes_last_updated, sa.stage_last_updated, ta.tasks_last_updated)
           < (now() - interval '30 days')
      OR (
        (coalesce(pi.hours_included, 0) + coalesce(pi.hours_added, 0)) > 0
        AND coalesce(pi.hours_used, 0)::numeric
            / (coalesce(pi.hours_included, 0) + coalesce(pi.hours_added, 0))::numeric
            >= 0.95
      )
      THEN 'stuck'
    WHEN greatest(na.notes_last_updated, sa.stage_last_updated, ta.tasks_last_updated)
           < (now() - interval '14 days')
      OR (
        (coalesce(pi.hours_included, 0) + coalesce(pi.hours_added, 0)) > 0
        AND coalesce(pi.hours_used, 0)::numeric
            / (coalesce(pi.hours_included, 0) + coalesce(pi.hours_added, 0))::numeric
            >= 0.75
      )
      OR coalesce(ta.overdue_tasks, 0) > 0
      THEN 'drifting'
    ELSE 'on_track'
  END                                                                     AS status_pill
FROM public.package_instances pi
JOIN public.packages p           ON p.id = pi.package_id
LEFT JOIN stage_agg sa           ON sa.package_instance_id = pi.id
LEFT JOIN tasks_agg ta           ON ta.package_instance_id = pi.id
LEFT JOIN notes_agg na           ON na.package_instance_id = pi.id
LEFT JOIN pinned pn              ON pn.package_instance_id = pi.id;

COMMENT ON VIEW public.v_client_package_dashboard IS
  'Week-1 client packages dashboard. Read-only. security_invoker=true; callers must pass explicit tenant_id filter. Pinned note source: public.notes (parent_type=package_instance, is_pinned). Activity = greatest(notes, stage_instances, client_action_items / client_task_instances). Created 2026-05-02.';

GRANT SELECT ON public.v_client_package_dashboard TO authenticated;