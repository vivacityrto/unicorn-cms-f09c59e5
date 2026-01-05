-- Configuration table for package type thresholds
CREATE TABLE IF NOT EXISTS public.package_type_thresholds (
  package_type text PRIMARY KEY,
  no_activity_days integer NOT NULL DEFAULT 14,
  waiting_warn_days integer NOT NULL DEFAULT 21,
  waiting_critical_days integer NOT NULL DEFAULT 45,
  hours_warn_pct integer NOT NULL DEFAULT 70,
  hours_critical_pct integer NOT NULL DEFAULT 90,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed default thresholds
INSERT INTO public.package_type_thresholds (package_type, no_activity_days, waiting_warn_days, waiting_critical_days)
VALUES 
  ('membership', 21, 21, 45),
  ('audit', 14, 21, 45),
  ('project', 14, 21, 45),
  ('regulatory_submission', 14, 21, 45)
ON CONFLICT (package_type) DO NOTHING;

-- Enable RLS
ALTER TABLE public.package_type_thresholds ENABLE ROW LEVEL SECURITY;

-- Allow read for authenticated users
CREATE POLICY "Authenticated users can read thresholds"
  ON public.package_type_thresholds
  FOR SELECT
  TO authenticated
  USING (true);

-- RPC function to compute dashboard rollups with next_action and risk_flags
CREATE OR REPLACE FUNCTION public.get_membership_rollups()
RETURNS TABLE (
  tenant_id bigint,
  package_id bigint,
  next_action_title text,
  next_action_due_at date,
  next_action_owner_id uuid,
  next_action_source text,
  next_action_reason text,
  risk_flags jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  threshold_record RECORD;
BEGIN
  -- Get membership threshold
  SELECT * INTO threshold_record 
  FROM public.package_type_thresholds 
  WHERE package_type = 'membership';
  
  IF NOT FOUND THEN
    threshold_record := ROW('membership', 21, 21, 45, 70, 90, now(), now());
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
      me.membership_state,
      p.package_type,
      t.name as tenant_name
    FROM public.membership_entitlements me
    JOIN public.packages p ON p.id = me.package_id
    JOIN public.tenants t ON t.id = me.tenant_id
    WHERE me.membership_state != 'exiting'
  ),
  task_stats AS (
    SELECT 
      mt.tenant_id,
      mt.package_id,
      COUNT(*) FILTER (WHERE mt.status = 'pending' AND mt.due_date < CURRENT_DATE) as overdue_count,
      MIN(mt.due_date) FILTER (WHERE mt.status = 'pending' AND mt.due_date < CURRENT_DATE) as earliest_overdue_date,
      (
        SELECT jsonb_build_object(
          'id', sub.id,
          'title', sub.title,
          'due_date', sub.due_date,
          'assigned_to', sub.assigned_to
        )
        FROM public.membership_tasks sub
        WHERE sub.tenant_id = mt.tenant_id 
          AND sub.package_id = mt.package_id
          AND sub.status = 'pending'
          AND sub.due_date < CURRENT_DATE
        ORDER BY sub.due_date ASC
        LIMIT 1
      ) as first_overdue_task,
      (
        SELECT jsonb_build_object(
          'id', sub.id,
          'title', sub.title,
          'due_date', sub.due_date,
          'assigned_to', sub.assigned_to
        )
        FROM public.membership_tasks sub
        WHERE sub.tenant_id = mt.tenant_id 
          AND sub.package_id = mt.package_id
          AND sub.status = 'pending'
        ORDER BY sub.due_date ASC NULLS LAST
        LIMIT 1
      ) as first_pending_task
    FROM public.membership_tasks mt
    GROUP BY mt.tenant_id, mt.package_id
  )
  SELECT 
    md.tenant_id::bigint,
    md.package_id::bigint,
    -- Next Action
    CASE 
      WHEN ts.first_overdue_task IS NOT NULL THEN ts.first_overdue_task->>'title'
      WHEN ts.first_pending_task IS NOT NULL THEN ts.first_pending_task->>'title'
      ELSE 'Review status and set next steps'
    END as next_action_title,
    CASE 
      WHEN ts.first_overdue_task IS NOT NULL THEN (ts.first_overdue_task->>'due_date')::date
      WHEN ts.first_pending_task IS NOT NULL THEN (ts.first_pending_task->>'due_date')::date
      ELSE CURRENT_DATE + INTERVAL '7 days'
    END::date as next_action_due_at,
    CASE 
      WHEN ts.first_overdue_task IS NOT NULL THEN (ts.first_overdue_task->>'assigned_to')::uuid
      WHEN ts.first_pending_task IS NOT NULL THEN (ts.first_pending_task->>'assigned_to')::uuid
      ELSE md.csc_user_id
    END as next_action_owner_id,
    CASE 
      WHEN ts.first_overdue_task IS NOT NULL THEN 'task'
      WHEN ts.first_pending_task IS NOT NULL THEN 'task'
      ELSE 'system'
    END as next_action_source,
    CASE 
      WHEN ts.first_overdue_task IS NOT NULL THEN 'Overdue task'
      WHEN ts.first_pending_task IS NOT NULL THEN 'Next pending task'
      ELSE 'No open tasks'
    END as next_action_reason,
    -- Risk Flags as JSON array
    (
      SELECT jsonb_agg(flag ORDER BY (flag->>'severity') DESC)
      FROM (
        -- OVERDUE_TASKS flag
        SELECT jsonb_build_object(
          'code', 'OVERDUE_TASKS',
          'severity', CASE 
            WHEN COALESCE(ts.overdue_count, 0) >= 3 THEN 'critical'
            WHEN COALESCE(ts.overdue_count, 0) > 0 THEN 'warn'
            ELSE NULL
          END,
          'message', COALESCE(ts.overdue_count, 0)::text || ' overdue task(s)',
          'source', 'task'
        ) as flag
        WHERE COALESCE(ts.overdue_count, 0) > 0
        
        UNION ALL
        
        -- MISSING_CSC flag
        SELECT jsonb_build_object(
          'code', 'MISSING_CSC',
          'severity', 'warn',
          'message', 'No CSC assigned',
          'source', 'system'
        ) as flag
        WHERE md.csc_user_id IS NULL
        
        UNION ALL
        
        -- NO_ACTIVITY flag
        SELECT jsonb_build_object(
          'code', 'NO_ACTIVITY',
          'severity', CASE 
            WHEN EXTRACT(EPOCH FROM (now() - md.last_activity_at))/86400 > 45 THEN 'critical'
            WHEN EXTRACT(EPOCH FROM (now() - md.last_activity_at))/86400 > threshold_record.no_activity_days THEN 'warn'
            WHEN md.last_activity_at IS NULL THEN 'warn'
            ELSE NULL
          END,
          'message', CASE 
            WHEN md.last_activity_at IS NULL THEN 'No recorded activity'
            ELSE 'No activity in ' || FLOOR(EXTRACT(EPOCH FROM (now() - md.last_activity_at))/86400)::text || ' days'
          END,
          'source', 'activity'
        ) as flag
        WHERE md.last_activity_at IS NULL 
           OR EXTRACT(EPOCH FROM (now() - md.last_activity_at))/86400 > threshold_record.no_activity_days
        
        UNION ALL
        
        -- HOURS_AT_RISK flag
        SELECT jsonb_build_object(
          'code', 'HOURS_AT_RISK',
          'severity', CASE 
            WHEN md.hours_included_monthly > 0 
              AND (md.hours_used_current_month::float / md.hours_included_monthly * 100) >= threshold_record.hours_critical_pct THEN 'critical'
            WHEN md.hours_included_monthly > 0 
              AND (md.hours_used_current_month::float / md.hours_included_monthly * 100) >= threshold_record.hours_warn_pct THEN 'warn'
            ELSE NULL
          END,
          'message', 'Hours at ' || ROUND(md.hours_used_current_month::float / NULLIF(md.hours_included_monthly, 0) * 100)::text || '%',
          'source', 'system'
        ) as flag
        WHERE md.hours_included_monthly > 0 
          AND (md.hours_used_current_month::float / md.hours_included_monthly * 100) >= threshold_record.hours_warn_pct
      ) flags
      WHERE flag->>'severity' IS NOT NULL
    ) as risk_flags
  FROM membership_data md
  LEFT JOIN task_stats ts ON ts.tenant_id = md.tenant_id AND ts.package_id = md.package_id;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_membership_rollups() TO authenticated;