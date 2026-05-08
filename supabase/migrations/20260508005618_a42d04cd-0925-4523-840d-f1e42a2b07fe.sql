BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';

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
    COALESCE(sh.critical_count, 0::bigint)::integer AS critical_stage_count,
    COALESCE(sh.at_risk_count, 0::bigint)::integer AS at_risk_stage_count,
    COALESCE(tk.open_count, 0::bigint)::integer AS open_tasks_count,
    COALESCE(tk.overdue_count, 0::bigint)::integer AS overdue_tasks_count,
    COALESCE(eg.mandatory_gaps, 0) AS mandatory_gaps_count,
    COALESCE(cl.hours_30d, 0::numeric) AS consult_hours_30d,
    COALESCE(bf.burn_risk_status, 'normal'::text) AS burn_risk_status,
    bf.projected_exhaustion_date,
    COALESCE(rf.retention_status, 'stable'::text) AS retention_status,
    rf.composite_retention_risk_index,
    tla.last_activity_at AS last_activity_at
   FROM tenants t
     LEFT JOIN LATERAL ( SELECT
                CASE re.severity
                    WHEN 'critical'::text THEN 90
                    WHEN 'high'::text THEN 70
                    WHEN 'moderate'::text THEN 40
                    ELSE 10
                END AS risk_index
           FROM risk_events re
          WHERE re.tenant_id = t.id
          ORDER BY re.created_at DESC
         LIMIT 1) ri ON true
     LEFT JOIN LATERAL ( SELECT
                CASE min(
                    CASE sub.hs
                        WHEN 'critical'::text THEN 1
                        WHEN 'at_risk'::text THEN 2
                        WHEN 'monitoring'::text THEN 3
                        ELSE 4
                    END)
                    WHEN 1 THEN 'critical'::text
                    WHEN 2 THEN 'at_risk'::text
                    WHEN 3 THEN 'monitoring'::text
                    ELSE 'healthy'::text
                END AS worst_health,
            count(*) FILTER (WHERE sub.hs = 'critical'::text) AS critical_count,
            count(*) FILTER (WHERE sub.hs = 'at_risk'::text) AS at_risk_count
           FROM ( SELECT DISTINCT ON (shs.stage_instance_id) shs.health_status AS hs
                   FROM stage_health_snapshots shs
                  WHERE shs.tenant_id = t.id
                  ORDER BY shs.stage_instance_id, shs.generated_at DESC) sub) sh ON true
     LEFT JOIN LATERAL ( SELECT count(*) FILTER (WHERE tt.completed = false) AS open_count,
            count(*) FILTER (WHERE tt.completed = false AND tt.due_date < now()) AS overdue_count,
            max(tt.updated_at) AS latest_task_at
           FROM tasks_tenants tt
          WHERE tt.tenant_id = t.id) tk ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(jsonb_array_length(egc.missing_categories_json)), 0::bigint)::integer AS mandatory_gaps,
            max(egc.created_at) AS latest_gap_at
           FROM evidence_gap_checks egc
          WHERE egc.tenant_id = t.id AND egc.status = 'gaps_found'::text) eg ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(c.hours), 0::numeric) AS hours_30d,
            max(c.date) AS latest_consult_at
           FROM consult_logs c
          WHERE c.client_id = t.id_uuid AND c.date >= (now() - '30 days'::interval)::date) cl ON true
     LEFT JOIN LATERAL ( SELECT bf2.burn_risk_status,
            bf2.projected_exhaustion_date
           FROM tenant_package_burn_forecast bf2
          WHERE bf2.tenant_id = t.id
          ORDER BY (
                CASE bf2.burn_risk_status
                    WHEN 'critical'::text THEN 1
                    WHEN 'warning'::text THEN 2
                    ELSE 3
                END)
         LIMIT 1) bf ON true
     LEFT JOIN LATERAL ( SELECT rf2.retention_status,
            rf2.composite_retention_risk_index
           FROM tenant_retention_forecasts rf2
          WHERE rf2.tenant_id = t.id
          ORDER BY rf2.forecast_date DESC
         LIMIT 1) rf ON true
     LEFT JOIN public.v_tenant_last_activity tla ON tla.tenant_id = t.id
  WHERE (t.lifecycle_status = ANY (ARRAY['active'::text, 'suspended'::text])) AND COALESCE(t.is_system_tenant, false) = false;

COMMIT;