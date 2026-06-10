
CREATE OR REPLACE VIEW public.v_tenant_last_activity AS
SELECT t.id AS tenant_id,
       t.lifecycle_status,
       GREATEST(
         COALESCE((SELECT max(di.updated_at) FROM public.document_instances di WHERE di.tenant_id = t.id), '1970-01-01 00:00:00+00'::timestamptz),
         COALESCE((SELECT max(n.updated_at)  FROM public.notes n              WHERE n.tenant_id  = t.id), '1970-01-01 00:00:00+00'::timestamptz),
         COALESCE((SELECT max(m.updated_at)  FROM public.meetings m           WHERE m.tenant_id  = t.id), '1970-01-01 00:00:00+00'::timestamptz),
         COALESCE((SELECT max(em.created_at) FROM public.email_messages em    WHERE em.tenant_id = t.id), '1970-01-01 00:00:00+00'::timestamptz),
         COALESCE(((SELECT max(cl.created_at) FROM public.consult_logs cl     WHERE cl.tenant_id = t.id))::timestamptz, '1970-01-01 00:00:00+00'::timestamptz),
         COALESCE((SELECT max(te.start_at)::timestamptz FROM public.time_entries te WHERE te.tenant_id = t.id), '1970-01-01 00:00:00+00'::timestamptz),
         COALESCE(t.created_at, '1970-01-01 00:00:00+00'::timestamptz)
       ) AS last_activity_at
FROM public.tenants t;

CREATE OR REPLACE VIEW public.v_dashboard_tenant_portfolio AS
SELECT t.id AS tenant_id,
       t.name AS tenant_name,
       t.status AS tenant_status,
       t.lifecycle_status,
       t.access_status,
       t.abn,
       t.rto_id,
       t.cricos_id,
       t.assigned_consultant_user_id AS assigned_csc_user_id,
       '[]'::jsonb AS packages_json,
       COALESCE(t.risk_level, 'stable'::text) AS risk_status,
       COALESCE(ri.risk_index, 0) AS risk_index,
       0 AS risk_index_delta_14d,
       COALESCE(sh.worst_health, 'healthy'::text) AS worst_stage_health_status,
       (COALESCE(sh.critical_count, 0::bigint))::integer AS critical_stage_count,
       (COALESCE(sh.at_risk_count, 0::bigint))::integer  AS at_risk_stage_count,
       (COALESCE(tk.open_count, 0::bigint))::integer     AS open_tasks_count,
       (COALESCE(tk.overdue_count, 0::bigint))::integer  AS overdue_tasks_count,
       COALESCE(eg.mandatory_gaps, 0) AS mandatory_gaps_count,
       COALESCE(cl.hours_30d, 0::numeric) AS consult_hours_30d,
       COALESCE(bf.burn_risk_status, 'normal'::text) AS burn_risk_status,
       bf.projected_exhaustion_date,
       COALESCE(rf.retention_status, 'stable'::text) AS retention_status,
       rf.composite_retention_risk_index,
       tla.last_activity_at
FROM public.tenants t
LEFT JOIN LATERAL (
  SELECT CASE re.severity WHEN 'critical' THEN 90 WHEN 'high' THEN 70 WHEN 'moderate' THEN 40 ELSE 10 END AS risk_index
  FROM public.risk_events re WHERE re.tenant_id = t.id ORDER BY re.created_at DESC LIMIT 1
) ri ON true
LEFT JOIN LATERAL (
  SELECT CASE min(CASE sub.hs WHEN 'critical' THEN 1 WHEN 'at_risk' THEN 2 WHEN 'monitoring' THEN 3 ELSE 4 END)
           WHEN 1 THEN 'critical' WHEN 2 THEN 'at_risk' WHEN 3 THEN 'monitoring' ELSE 'healthy' END AS worst_health,
         count(*) FILTER (WHERE sub.hs = 'critical') AS critical_count,
         count(*) FILTER (WHERE sub.hs = 'at_risk')  AS at_risk_count
  FROM (SELECT DISTINCT ON (shs.stage_instance_id) shs.health_status AS hs
        FROM public.stage_health_snapshots shs WHERE shs.tenant_id = t.id
        ORDER BY shs.stage_instance_id, shs.generated_at DESC) sub
) sh ON true
LEFT JOIN LATERAL (
  SELECT count(*) FILTER (WHERE cai.completed_at IS NULL) AS open_count,
         count(*) FILTER (WHERE cai.completed_at IS NULL AND cai.due_date IS NOT NULL AND cai.due_date < CURRENT_DATE) AS overdue_count,
         max(cai.updated_at) AS latest_task_at
  FROM public.client_action_items cai WHERE cai.tenant_id = t.id
) tk ON true
LEFT JOIN LATERAL (
  SELECT (COALESCE(sum(jsonb_array_length(egc.missing_categories_json)), 0::bigint))::integer AS mandatory_gaps,
         max(egc.created_at) AS latest_gap_at
  FROM public.evidence_gap_checks egc WHERE egc.tenant_id = t.id AND egc.status = 'gaps_found'
) eg ON true
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(te.duration_minutes) / 60.0, 0::numeric) AS hours_30d
  FROM public.time_entries te
  WHERE te.tenant_id = t.id AND te.start_at >= now() - interval '30 days'
) cl ON true
LEFT JOIN LATERAL (
  SELECT bf2.burn_risk_status, bf2.projected_exhaustion_date
  FROM public.tenant_package_burn_forecast bf2 WHERE bf2.tenant_id = t.id
  ORDER BY CASE bf2.burn_risk_status WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END LIMIT 1
) bf ON true
LEFT JOIN LATERAL (
  SELECT rf2.retention_status, rf2.composite_retention_risk_index
  FROM public.tenant_retention_forecasts rf2 WHERE rf2.tenant_id = t.id
  ORDER BY rf2.forecast_date DESC LIMIT 1
) rf ON true
LEFT JOIN public.v_tenant_last_activity tla ON tla.tenant_id = t.id
WHERE t.status = 'active' AND COALESCE(t.is_system_tenant, false) = false;
