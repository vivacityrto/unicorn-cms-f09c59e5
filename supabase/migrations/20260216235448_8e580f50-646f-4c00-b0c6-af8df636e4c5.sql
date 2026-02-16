
-- 1. priority_inbox_actions table
CREATE TABLE IF NOT EXISTS public.priority_inbox_actions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id text NOT NULL,
  item_type text NOT NULL DEFAULT 'inbox',
  user_id uuid NOT NULL,
  action_type text NOT NULL CHECK (action_type IN ('acknowledge', 'snooze')),
  until_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.priority_inbox_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own inbox actions" ON public.priority_inbox_actions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_priority_inbox_actions_user ON public.priority_inbox_actions(user_id, item_id);

-- 2. audit_dashboard_events table
CREATE TABLE IF NOT EXISTS public.audit_dashboard_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_user_id uuid NOT NULL,
  action text NOT NULL,
  tenant_id bigint,
  metadata_json jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.audit_dashboard_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Vivacity staff insert dashboard events" ON public.audit_dashboard_events FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid = auth.uid() AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')));
CREATE POLICY "Vivacity staff read dashboard events" ON public.audit_dashboard_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid = auth.uid() AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')));

-- 3. v_dashboard_tenant_portfolio
CREATE OR REPLACE VIEW public.v_dashboard_tenant_portfolio WITH (security_invoker = true) AS
SELECT
  t.id AS tenant_id, t.name AS tenant_name, t.status AS tenant_status,
  t.abn, t.rto_id, t.cricos_id,
  t.assigned_consultant_user_id AS assigned_csc_user_id,
  '[]'::jsonb AS packages_json,
  COALESCE(t.risk_level, 'stable') AS risk_status,
  COALESCE(ri.risk_index, 0) AS risk_index, 0 AS risk_index_delta_14d,
  COALESCE(sh.worst_health, 'healthy') AS worst_stage_health_status,
  COALESCE(sh.critical_count, 0)::int AS critical_stage_count,
  COALESCE(sh.at_risk_count, 0)::int AS at_risk_stage_count,
  COALESCE(tk.open_count, 0)::int AS open_tasks_count,
  COALESCE(tk.overdue_count, 0)::int AS overdue_tasks_count,
  COALESCE(eg.mandatory_gaps, 0)::int AS mandatory_gaps_count,
  COALESCE(cl.hours_30d, 0)::numeric AS consult_hours_30d,
  COALESCE(bf.burn_risk_status, 'normal') AS burn_risk_status,
  bf.projected_exhaustion_date,
  COALESCE(rf.retention_status, 'stable') AS retention_status,
  rf.composite_retention_risk_index,
  GREATEST(tk.latest_task_at, cl.latest_consult_at, eg.latest_gap_at) AS last_activity_at
FROM public.tenants t
LEFT JOIN LATERAL (
  SELECT CASE re.severity WHEN 'critical' THEN 90 WHEN 'high' THEN 70 WHEN 'moderate' THEN 40 ELSE 10 END AS risk_index
  FROM public.risk_events re WHERE re.tenant_id = t.id ORDER BY re.created_at DESC LIMIT 1
) ri ON true
LEFT JOIN LATERAL (
  SELECT
    CASE MIN(CASE sub.hs WHEN 'critical' THEN 1 WHEN 'at_risk' THEN 2 WHEN 'monitoring' THEN 3 ELSE 4 END)
      WHEN 1 THEN 'critical' WHEN 2 THEN 'at_risk' WHEN 3 THEN 'monitoring' ELSE 'healthy' END AS worst_health,
    COUNT(*) FILTER (WHERE sub.hs = 'critical') AS critical_count,
    COUNT(*) FILTER (WHERE sub.hs = 'at_risk') AS at_risk_count
  FROM (SELECT DISTINCT ON (shs.stage_instance_id) shs.health_status AS hs FROM public.stage_health_snapshots shs WHERE shs.tenant_id = t.id ORDER BY shs.stage_instance_id, shs.generated_at DESC) sub
) sh ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*) FILTER (WHERE tt.completed = false) AS open_count,
    COUNT(*) FILTER (WHERE tt.completed = false AND tt.due_date < now()) AS overdue_count,
    MAX(tt.updated_at) AS latest_task_at
  FROM public.tasks_tenants tt WHERE tt.tenant_id = t.id
) tk ON true
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(jsonb_array_length(egc.missing_categories_json)), 0)::int AS mandatory_gaps, MAX(egc.created_at) AS latest_gap_at
  FROM public.evidence_gap_checks egc WHERE egc.tenant_id = t.id AND egc.status = 'gaps_found'
) eg ON true
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(c.hours), 0) AS hours_30d, MAX(c.date) AS latest_consult_at
  FROM public.consult_logs c WHERE c.client_id = t.id_uuid AND c.date >= (now() - interval '30 days')::date
) cl ON true
LEFT JOIN LATERAL (
  SELECT bf2.burn_risk_status, bf2.projected_exhaustion_date
  FROM public.tenant_package_burn_forecast bf2 WHERE bf2.tenant_id = t.id
  ORDER BY CASE bf2.burn_risk_status WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END LIMIT 1
) bf ON true
LEFT JOIN LATERAL (
  SELECT rf2.retention_status, rf2.composite_retention_risk_index
  FROM public.tenant_retention_forecasts rf2 WHERE rf2.tenant_id = t.id ORDER BY rf2.forecast_date DESC LIMIT 1
) rf ON true
WHERE t.status = 'active' AND COALESCE(t.is_system_tenant, false) = false;

-- 4. v_dashboard_attention_ranked
CREATE OR REPLACE VIEW public.v_dashboard_attention_ranked WITH (security_invoker = true) AS
WITH scored AS (
  SELECT p.*,
    LEAST(100, GREATEST(0,
      COALESCE(p.risk_index, 0)::numeric * 0.25
      + CASE p.worst_stage_health_status WHEN 'critical' THEN 30 WHEN 'at_risk' THEN 20 WHEN 'monitoring' THEN 5 ELSE 0 END
      + LEAST(15, COALESCE(p.mandatory_gaps_count, 0) * 3)
      + CASE WHEN p.burn_risk_status = 'critical' THEN 15 ELSE 0 END
      + CASE p.retention_status WHEN 'high_risk' THEN 10 WHEN 'vulnerable' THEN 5 ELSE 0 END
      + LEAST(10, COALESCE(EXTRACT(EPOCH FROM (now() - p.last_activity_at)) / 86400 / 3, 0))
      + LEAST(10, COALESCE(p.overdue_tasks_count, 0) * 2)
    ))::int AS attention_score,
    jsonb_strip_nulls(jsonb_build_array(
      CASE WHEN p.worst_stage_health_status IN ('critical','at_risk') THEN jsonb_build_object('driver','stage_health','value',p.worst_stage_health_status,'detail',p.critical_stage_count||' critical, '||p.at_risk_stage_count||' at risk') END,
      CASE WHEN p.risk_status IN ('high','elevated') THEN jsonb_build_object('driver','risk','value',p.risk_status,'detail','Index '||p.risk_index) END,
      CASE WHEN p.mandatory_gaps_count > 0 THEN jsonb_build_object('driver','evidence_gaps','value',p.mandatory_gaps_count,'detail',p.mandatory_gaps_count||' mandatory gaps') END,
      CASE WHEN p.burn_risk_status = 'critical' THEN jsonb_build_object('driver','burn_risk','value','critical','detail','Exhaustion: '||COALESCE(p.projected_exhaustion_date::text,'unknown')) END,
      CASE WHEN p.retention_status IN ('high_risk','vulnerable') THEN jsonb_build_object('driver','retention','value',p.retention_status,'detail','Retention at risk') END,
      CASE WHEN p.overdue_tasks_count > 0 THEN jsonb_build_object('driver','overdue_tasks','value',p.overdue_tasks_count,'detail',p.overdue_tasks_count||' overdue') END
    )) AS attention_drivers_json,
    COALESCE(EXTRACT(EPOCH FROM (now() - p.last_activity_at)) / 86400, 999)::int AS days_since_activity
  FROM public.v_dashboard_tenant_portfolio p
) SELECT * FROM scored ORDER BY attention_score DESC;

-- 5. v_dashboard_risk_clusters
CREATE OR REPLACE VIEW public.v_dashboard_risk_clusters WITH (security_invoker = true) AS
SELECT
  re.standard_clause, COUNT(DISTINCT re.tenant_id) AS tenant_count, COUNT(*) AS total_events,
  MAX(re.created_at) AS latest_event_at,
  COUNT(*) FILTER (WHERE re.created_at >= now() - interval '14 days') AS events_last_14d,
  COUNT(*) FILTER (WHERE re.created_at >= now() - interval '28 days' AND re.created_at < now() - interval '14 days') AS events_prior_14d,
  CASE
    WHEN COUNT(*) FILTER (WHERE re.created_at >= now() - interval '14 days') > COUNT(*) FILTER (WHERE re.created_at >= now() - interval '28 days' AND re.created_at < now() - interval '14 days') THEN 'rising'
    WHEN COUNT(*) FILTER (WHERE re.created_at >= now() - interval '14 days') < COUNT(*) FILTER (WHERE re.created_at >= now() - interval '28 days' AND re.created_at < now() - interval '14 days') THEN 'falling'
    ELSE 'stable'
  END AS trend,
  EXISTS (
    SELECT 1 FROM public.regulator_change_events rce
    WHERE rce.affected_areas_json::text ILIKE '%' || re.standard_clause || '%' AND rce.review_status = 'pending'
  ) AS has_regulator_overlap
FROM public.risk_events re
WHERE re.standard_clause IS NOT NULL AND re.standard_clause != ''
GROUP BY re.standard_clause ORDER BY tenant_count DESC, total_events DESC LIMIT 10;

-- 6. v_dashboard_labour_efficiency
CREATE OR REPLACE VIEW public.v_dashboard_labour_efficiency WITH (security_invoker = true) AS
SELECT
  u.user_uuid AS csc_user_id, u.first_name || ' ' || u.last_name AS csc_name,
  COUNT(DISTINCT tp.tenant_id) AS client_count,
  COALESCE(ccp.effective_weekly_capacity_hours, 0) AS weekly_capacity_hours,
  COALESCE(SUM(tp.overdue_tasks_count), 0) AS total_overdue_tasks,
  COALESCE(SUM(tp.open_tasks_count), 0) AS total_open_tasks,
  CASE WHEN COALESCE(SUM(tp.open_tasks_count), 0) = 0 THEN 0
    ELSE ROUND((SUM(tp.overdue_tasks_count)::numeric / NULLIF(SUM(tp.open_tasks_count), 0) * 100)::numeric, 1)
  END AS overdue_ratio_pct,
  COUNT(DISTINCT tp.tenant_id) FILTER (WHERE tp.worst_stage_health_status IN ('critical','at_risk') OR tp.risk_status IN ('high','elevated')) AS intensive_clients,
  COUNT(DISTINCT tp.tenant_id) FILTER (WHERE tp.worst_stage_health_status NOT IN ('critical','at_risk') AND tp.risk_status NOT IN ('high','elevated')) AS low_touch_clients
FROM public.users u
LEFT JOIN public.v_dashboard_tenant_portfolio tp ON tp.assigned_csc_user_id = u.user_uuid
LEFT JOIN public.consultant_capacity_profiles ccp ON ccp.user_id = u.user_uuid
WHERE u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')
GROUP BY u.user_uuid, u.first_name, u.last_name, ccp.effective_weekly_capacity_hours;
