CREATE OR REPLACE VIEW public.v_client_dashboard_progress
WITH (security_invoker = true)
AS
WITH stage_agg AS (
  SELECT si.packageinstance_id AS package_instance_id,
         count(*)::integer AS stages_total,
         count(*) FILTER (WHERE si.status_id = ANY (ARRAY[2, 3]))::integer AS stages_complete,
         min(si.stage_sortorder) FILTER (WHERE si.status_id IS NULL OR (si.status_id <> ALL (ARRAY[2, 3]))) AS current_stage_sortorder
  FROM stage_instances si
  GROUP BY si.packageinstance_id
), current_stage AS (
  SELECT DISTINCT ON (si.packageinstance_id) si.packageinstance_id AS package_instance_id,
         COALESCE(NULLIF(TRIM(BOTH FROM s.name), ''::text), s.shortname) AS phase_name
  FROM stage_instances si
  JOIN stages s ON s.id = si.stage_id
  WHERE (si.status_id IS NULL OR (si.status_id <> ALL (ARRAY[2, 3])))
    AND COALESCE(s.is_archived, false) = false
    AND COALESCE(s.is_audit_workspace, false) = false
  ORDER BY si.packageinstance_id, si.stage_sortorder
)
SELECT pi.tenant_id,
       pi.id AS package_instance_id,
       pi.package_id,
       COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''::text), p.name) AS package_name,
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
       CASE
         WHEN COALESCE(sa.stages_total, 0) = 0 THEN 'on_track'::text
         WHEN COALESCE(sa.stages_complete, 0) = 0 THEN 'needs_attention'::text
         ELSE 'on_track'::text
       END AS risk_state,
       CASE
         WHEN COALESCE(sa.stages_total, 0) > 0 AND sa.stages_complete < sa.stages_total THEN 'complete_tasks'::text
         ELSE 'review_progress'::text
       END AS next_best_action_type,
       CASE
         WHEN COALESCE(sa.stages_total, 0) > 0 AND sa.stages_complete < sa.stages_total THEN 'Continue your next stage'::text
         ELSE 'Review progress summary'::text
       END AS next_best_action_label,
       CASE
         WHEN COALESCE(sa.stages_total, 0) > 0 AND sa.stages_complete < sa.stages_total THEN '/client/packages'::text
         ELSE '/client/home'::text
       END AS next_best_action_href,
       now() AS score_calculated_at
FROM package_instances pi
JOIN packages p ON p.id = pi.package_id
LEFT JOIN stage_agg sa ON sa.package_instance_id = pi.id
LEFT JOIN current_stage cs ON cs.package_instance_id = pi.id
WHERE pi.is_complete = false;