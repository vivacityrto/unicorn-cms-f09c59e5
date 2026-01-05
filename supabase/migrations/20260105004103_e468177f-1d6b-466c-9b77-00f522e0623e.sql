-- Drop and recreate the function with new return type
DROP FUNCTION IF EXISTS public.get_membership_rollups();

-- =====================================================
-- Updated get_membership_rollups with deterministic progress
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_membership_rollups()
RETURNS TABLE (
    tenant_id bigint,
    package_id bigint,
    next_action_title text,
    next_action_due_at date,
    next_action_owner_id uuid,
    next_action_source text,
    next_action_reason text,
    risk_flags jsonb,
    current_stage_name text,
    current_stage_status text,
    progress_percent numeric,
    phase text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_threshold RECORD;
BEGIN
    -- Get thresholds
    SELECT * INTO v_threshold 
    FROM public.package_type_thresholds 
    WHERE package_type = 'membership';
    
    IF v_threshold IS NULL THEN
        v_threshold := ROW('membership', 21, 21, 45, 70, 90, 14);
    END IF;

    RETURN QUERY
    WITH membership_data AS (
        SELECT 
            me.tenant_id,
            me.package_id,
            me.csc_user_id,
            me.hours_used_current_month,
            me.hours_included_monthly,
            me.last_activity_at,
            me.current_stage_state_id,
            p.package_type,
            p.progress_mode,
            t.name as tenant_name
        FROM public.membership_entitlements me
        INNER JOIN public.packages p ON p.id = me.package_id
        INNER JOIN public.tenants t ON t.id = me.tenant_id
    ),
    stage_data AS (
        SELECT 
            cpss.client_package_id,
            cpss.id as stage_state_id,
            cpss.status as stage_status,
            cpss.waiting_at,
            cpss.blocked_at,
            cpss.started_at as stage_started_at,
            cpss.is_required,
            ds.title as stage_name,
            ds.stage_type,
            ds.sla_days
        FROM public.client_package_stage_state cpss
        INNER JOIN public.documents_stages ds ON ds.id = cpss.package_stage_id
    ),
    current_stages AS (
        SELECT DISTINCT ON (sd.client_package_id)
            sd.client_package_id,
            sd.stage_name,
            sd.stage_status,
            sd.stage_type,
            sd.waiting_at,
            sd.blocked_at,
            sd.stage_started_at,
            sd.sla_days
        FROM stage_data sd
        WHERE sd.stage_status IN ('in_progress', 'blocked', 'waiting')
        ORDER BY sd.client_package_id, 
            CASE sd.stage_status 
                WHEN 'in_progress' THEN 1 
                WHEN 'blocked' THEN 2 
                WHEN 'waiting' THEN 3 
            END
    ),
    progress_calc AS (
        SELECT 
            sd.client_package_id,
            CASE 
                WHEN COUNT(*) FILTER (WHERE sd.is_required) = 0 THEN 0
                ELSE ROUND(
                    (COUNT(*) FILTER (WHERE sd.is_required AND sd.stage_status = 'complete')::numeric / 
                     NULLIF(COUNT(*) FILTER (WHERE sd.is_required), 0)) * 100, 
                    0
                )
            END as progress_pct
        FROM stage_data sd
        GROUP BY sd.client_package_id
    ),
    task_data AS (
        SELECT 
            mt.tenant_id,
            mt.package_id,
            mt.id as task_id,
            mt.title as task_title,
            mt.due_date,
            mt.assigned_to,
            mt.status as task_status,
            CASE 
                WHEN mt.status IN ('done', 'cancelled') THEN 0
                WHEN mt.due_date < CURRENT_DATE THEN 1
                WHEN mt.status = 'blocked' THEN 2
                ELSE 3
            END as priority_order
        FROM public.membership_tasks mt
        WHERE mt.status NOT IN ('done', 'cancelled')
    ),
    overdue_counts AS (
        SELECT 
            td.tenant_id,
            td.package_id,
            COUNT(*) as overdue_count,
            MAX(CURRENT_DATE - td.due_date) as max_overdue_days
        FROM task_data td
        WHERE td.due_date < CURRENT_DATE
        GROUP BY td.tenant_id, td.package_id
    ),
    next_tasks AS (
        SELECT DISTINCT ON (td.tenant_id, td.package_id)
            td.tenant_id,
            td.package_id,
            td.task_id,
            td.task_title,
            td.due_date,
            td.assigned_to,
            td.priority_order
        FROM task_data td
        ORDER BY td.tenant_id, td.package_id, td.priority_order, td.due_date NULLS LAST
    )
    SELECT 
        md.tenant_id,
        md.package_id,
        COALESCE(nt.task_title, 'Review status and set next steps')::text as next_action_title,
        COALESCE(nt.due_date, (CURRENT_DATE + 7))::date as next_action_due_at,
        COALESCE(nt.assigned_to, md.csc_user_id) as next_action_owner_id,
        CASE WHEN nt.task_id IS NOT NULL THEN 'task' ELSE 'system' END::text as next_action_source,
        CASE 
            WHEN nt.priority_order = 1 THEN 'Overdue task'
            WHEN nt.priority_order = 2 THEN 'Blocked task'
            WHEN nt.task_title IS NOT NULL THEN 'Next scheduled task'
            ELSE 'No open tasks'
        END::text as next_action_reason,
        -- Build risk flags as JSONB array
        (
            SELECT COALESCE(jsonb_agg(flag), '[]'::jsonb)
            FROM (
                -- OVERDUE_TASKS
                SELECT jsonb_build_object(
                    'code', 'OVERDUE_TASKS',
                    'severity', CASE 
                        WHEN oc.overdue_count >= 3 OR oc.max_overdue_days > 14 THEN 'critical'
                        ELSE 'warn'
                    END,
                    'message', oc.overdue_count || ' overdue task(s)',
                    'source', 'task'
                ) as flag
                FROM overdue_counts oc
                WHERE oc.tenant_id = md.tenant_id AND oc.package_id = md.package_id
                
                UNION ALL
                
                -- MISSING_CSC
                SELECT jsonb_build_object(
                    'code', 'MISSING_CSC',
                    'severity', 'warn',
                    'message', 'No CSC assigned',
                    'source', 'system'
                ) as flag
                WHERE md.csc_user_id IS NULL
                
                UNION ALL
                
                -- NO_ACTIVITY
                SELECT jsonb_build_object(
                    'code', 'NO_ACTIVITY',
                    'severity', CASE 
                        WHEN EXTRACT(DAY FROM now() - md.last_activity_at) > 45 THEN 'critical'
                        ELSE 'warn'
                    END,
                    'message', 'No activity in ' || EXTRACT(DAY FROM now() - md.last_activity_at)::int || ' days',
                    'source', 'activity'
                ) as flag
                WHERE md.last_activity_at IS NOT NULL 
                  AND EXTRACT(DAY FROM now() - md.last_activity_at) > 21
                
                UNION ALL
                
                -- HOURS_AT_RISK
                SELECT jsonb_build_object(
                    'code', 'HOURS_AT_RISK',
                    'severity', CASE 
                        WHEN (md.hours_used_current_month::numeric / NULLIF(md.hours_included_monthly, 0)) >= 0.9 THEN 'critical'
                        ELSE 'warn'
                    END,
                    'message', 'Hours at ' || ROUND((md.hours_used_current_month::numeric / NULLIF(md.hours_included_monthly, 0)) * 100) || '%',
                    'source', 'system'
                ) as flag
                WHERE md.hours_included_monthly > 0
                  AND (md.hours_used_current_month::numeric / md.hours_included_monthly) >= 0.7
            ) flags
        ) as risk_flags,
        cs.stage_name as current_stage_name,
        cs.stage_status as current_stage_status,
        COALESCE(pc.progress_pct, 0) as progress_percent,
        CASE cs.stage_type
            WHEN 'setup' THEN 'Setup'
            WHEN 'delivery' THEN 'Delivery'
            WHEN 'review' THEN 'Delivery'
            WHEN 'submission' THEN 'Submission'
            WHEN 'waiting' THEN 'External'
            WHEN 'closeout' THEN 'Closeout'
            ELSE 'Ongoing'
        END::text as phase
    FROM membership_data md
    LEFT JOIN current_stages cs ON cs.client_package_id::text = md.tenant_id::text || '-' || md.package_id::text
    LEFT JOIN progress_calc pc ON pc.client_package_id::text = md.tenant_id::text || '-' || md.package_id::text
    LEFT JOIN next_tasks nt ON nt.tenant_id = md.tenant_id AND nt.package_id = md.package_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_membership_rollups() TO authenticated;