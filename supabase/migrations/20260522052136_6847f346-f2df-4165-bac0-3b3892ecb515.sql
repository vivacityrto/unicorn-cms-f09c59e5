CREATE OR REPLACE VIEW public.v_client_package_stages AS
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
        WHEN si.status_id = ANY (ARRAY[2, 3])
             OR si.status_id = 4
             OR (si.status_id = 1 AND si.status = '4')
            THEN 'complete'::text
        WHEN si.id = (
            SELECT si2.id
              FROM public.stage_instances si2
              JOIN public.stages s2 ON s2.id = si2.stage_id
             WHERE si2.packageinstance_id = pi.id
               AND NOT (
                    si2.status_id = ANY (ARRAY[2, 3])
                 OR si2.status_id = 4
                 OR (si2.status_id = 1 AND si2.status = '4')
               )
               AND COALESCE(s2.is_archived, false) = false
               AND COALESCE(s2.is_audit_workspace, false) = false
             ORDER BY si2.stage_sortorder
             LIMIT 1
        ) THEN 'current'::text
        ELSE 'future'::text
    END AS node_state
FROM public.package_instances pi
JOIN public.stage_instances si ON si.packageinstance_id = pi.id
JOIN public.stages s ON s.id = si.stage_id
WHERE COALESCE(s.is_archived, false) = false
  AND COALESCE(s.is_audit_workspace, false) = false;