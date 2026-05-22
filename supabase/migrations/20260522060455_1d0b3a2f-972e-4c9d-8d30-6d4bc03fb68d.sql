CREATE OR REPLACE VIEW public.v_client_dashboard_progress
WITH (security_invoker=true) AS
WITH stage_agg AS (
  SELECT si.packageinstance_id AS package_instance_id,
         count(*)::int AS stages_total,
         count(*) FILTER (
           WHERE si.status_id = ANY (ARRAY[2, 3])
              OR si.status_id = 4
              OR (si.status_id = 1 AND si.status = '4')
         )::int AS stages_complete,
         min(si.stage_sortorder) FILTER (
           WHERE NOT (
                si.status_id = ANY (ARRAY[2, 3])
             OR si.status_id = 4
             OR (si.status_id = 1 AND si.status = '4')
           )
         ) AS current_stage_sortorder
    FROM public.stage_instances si
    JOIN public.stages s ON s.id = si.stage_id
   WHERE COALESCE(s.is_audit_workspace, false) = false
     AND COALESCE(s.is_archived, false) = false
   GROUP BY si.packageinstance_id
),
current_stage AS (
  SELECT DISTINCT ON (si.packageinstance_id)
         si.packageinstance_id AS package_instance_id,
         COALESCE(NULLIF(TRIM(BOTH FROM s.name), ''), s.shortname) AS phase_name
    FROM public.stage_instances si
    JOIN public.stages s ON s.id = si.stage_id
   WHERE NOT (
          si.status_id = ANY (ARRAY[2, 3])
       OR si.status_id = 4
       OR (si.status_id = 1 AND si.status = '4')
       )
     AND COALESCE(s.is_archived, false) = false
     AND COALESCE(s.is_audit_workspace, false) = false
   ORDER BY si.packageinstance_id, si.stage_sortorder
)
SELECT pi.tenant_id,
       pi.id AS package_instance_id,
       pi.package_id,
       COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''), p.name) AS package_name,
       cs.phase_name AS current_phase_name,
       CASE
         WHEN COALESCE(sa.stages_total, 0) = 0 THEN 0
         ELSE round(100.0 * sa.stages_complete::numeric / sa.stages_total::numeric)::integer
       END AS phase_completion,
       GREATEST(COALESCE(sa.stages_total, 0) - COALESCE(sa.stages_complete, 0), 0) AS steps_remaining,
       CASE
         WHEN COALESCE(sa.stages_total, 0) = 0 THEN 0
         ELSE round(100.0 * sa.stages_complete::numeric / sa.stages_total::numeric)::integer
       END AS overall_score,
       0 AS documentation_coverage,
       'on_track'::text AS risk_state,
       CASE
         WHEN COALESCE(sa.stages_total, 0) > 0 AND sa.stages_complete < sa.stages_total THEN 'complete_tasks'
         ELSE 'review_progress'
       END AS next_best_action_type,
       CASE
         WHEN COALESCE(sa.stages_total, 0) > 0 AND sa.stages_complete < sa.stages_total THEN 'Continue your next stage'
         ELSE 'Review progress summary'
       END AS next_best_action_label,
       CASE
         WHEN COALESCE(sa.stages_total, 0) > 0 AND sa.stages_complete < sa.stages_total THEN '/client/packages'
         ELSE '/client/home'
       END AS next_best_action_href,
       now() AS score_calculated_at
  FROM public.package_instances pi
  JOIN public.packages p ON p.id = pi.package_id
  LEFT JOIN stage_agg sa ON sa.package_instance_id = pi.id
  LEFT JOIN current_stage cs ON cs.package_instance_id = pi.id
 WHERE pi.is_complete = false;

COMMENT ON VIEW public.v_client_dashboard_progress IS 'Per-package progress for the client Home page. stage_agg/current_stage exclude audit-workspace and archived stages, and recognise Core Complete (status_id=4 or legacy status_id=1 + status=''4'') alongside canonical complete (status_id IN (2,3)). risk_state defaults to on_track; richer signals live in get_client_package_dashboard.status_pill. documentation_coverage is a 0 placeholder pending real document tracking. security_invoker=true.';