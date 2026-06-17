CREATE OR REPLACE VIEW public.v_admin_zero_progress_packages AS
WITH stage_counts AS (
         SELECT si.packageinstance_id,
            count(*)::integer AS stages_total,
            count(*) FILTER (WHERE si.status_id = ANY (ARRAY[2, 3]))::integer AS stages_complete,
            max(si.updated_at) AS max_stage_updated_at
           FROM stage_instances si
          GROUP BY si.packageinstance_id
        ), task_counts AS (
         SELECT cai.package_instance_id,
            count(*) AS ai_total,
            count(*) FILTER (WHERE cai.completed_at IS NOT NULL) AS ai_completed,
            max(cai.updated_at) AS max_ai_updated_at
           FROM client_action_items cai
          WHERE cai.package_instance_id IS NOT NULL
          GROUP BY cai.package_instance_id
        ), legacy_task_counts AS (
         SELECT si.packageinstance_id AS package_instance_id,
            count(*) AS ti_total,
            count(*) FILTER (WHERE cti.completion_date IS NOT NULL) AS ti_completed,
            count(*) FILTER (WHERE COALESCE(cti.is_archived, false) = false AND cti.completion_date IS NULL) AS ti_open,
            max(cti.updated_at) AS max_ti_updated_at
           FROM client_task_instances cti
             JOIN stage_instances si ON si.id = cti.stageinstance_id
          GROUP BY si.packageinstance_id
        ), hours AS (
         SELECT te.package_instance_id,
            COALESCE(sum(te.duration_minutes), 0::bigint)::numeric / 60.0 AS hours_logged,
            max(te.start_at) AS max_te_at
           FROM time_entries te
          WHERE te.package_instance_id IS NOT NULL AND te.is_billable = true
          GROUP BY te.package_instance_id
        )
 SELECT pi.id AS package_instance_id,
    pi.tenant_id,
    t.name AS tenant_name,
    t.legal_name AS tenant_legal_name,
    COALESCE(NULLIF(TRIM(BOTH FROM p.full_text), ''::text), p.name) AS package_name,
    p.package_type,
    pi.manager_id,
    pi.start_date,
    pi.end_date,
    CURRENT_DATE - pi.start_date AS days_since_start,
    pi.is_active,
    pi.is_complete,
    COALESCE(sc.stages_total, 0) AS stages_total,
    COALESCE(sc.stages_complete, 0) AS stages_complete,
    COALESCE(tc.ai_total, 0::bigint) AS action_items_total,
    COALESCE(tc.ai_completed, 0::bigint) AS action_items_completed,
    COALESCE(ltc.ti_total, 0::bigint) AS legacy_tasks_total,
    COALESCE(ltc.ti_completed, 0::bigint) AS legacy_tasks_completed,
    COALESCE(ltc.ti_open, 0::bigint) AS legacy_tasks_open,
    COALESCE(h.hours_logged, 0::numeric) AS hours_logged,
    GREATEST(COALESCE(sc.max_stage_updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(tc.max_ai_updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(ltc.max_ti_updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(h.max_te_at, '1970-01-01 00:00:00+00'::timestamp with time zone)) AS last_activity_at,
        CASE
            WHEN (COALESCE(tc.ai_completed, 0::bigint) + COALESCE(ltc.ti_completed, 0::bigint)) = 0 AND COALESCE(h.hours_logged, 0::numeric) = 0::numeric THEN 'pre_release'::text
            WHEN GREATEST(COALESCE(sc.max_stage_updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(tc.max_ai_updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(ltc.max_ti_updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(h.max_te_at, '1970-01-01 00:00:00+00'::timestamp with time zone)) < (now() - '90 days'::interval) THEN 'dormant'::text
            WHEN (COALESCE(tc.ai_completed, 0::bigint) + COALESCE(ltc.ti_completed, 0::bigint)) > 0 OR COALESCE(h.hours_logged, 0::numeric) > 0::numeric OR GREATEST(COALESCE(sc.max_stage_updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(tc.max_ai_updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(ltc.max_ti_updated_at, '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(h.max_te_at, '1970-01-01 00:00:00+00'::timestamp with time zone)) > (now() - '30 days'::interval) THEN 'investigate'::text
            ELSE 'review'::text
        END AS triage_category
   FROM package_instances pi
     JOIN tenants t ON t.id = pi.tenant_id
     JOIN packages p ON p.id = pi.package_id
     LEFT JOIN stage_counts sc ON sc.packageinstance_id = pi.id
     LEFT JOIN task_counts tc ON tc.package_instance_id = pi.id
     LEFT JOIN legacy_task_counts ltc ON ltc.package_instance_id = pi.id
     LEFT JOIN hours h ON h.package_instance_id = pi.id
  WHERE pi.is_active = true AND COALESCE(pi.is_complete, false) = false AND pi.start_date IS NOT NULL AND pi.start_date < (CURRENT_DATE - '60 days'::interval) AND COALESCE(sc.stages_complete, 0) = 0;