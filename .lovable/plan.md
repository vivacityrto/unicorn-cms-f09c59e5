## Phase 0 — Recreate two dashboard views

Single migration replacing `v_dashboard_tenant_portfolio` and `v_tenant_last_activity` with corrected data sources. No table/RLS/grant changes; views inherit caller privileges as today.

### Order of operations
Views have a dependency: `v_dashboard_tenant_portfolio` LEFT JOINs `v_tenant_last_activity`. Use `CREATE OR REPLACE VIEW` for both (column lists unchanged), `v_tenant_last_activity` first, then `v_dashboard_tenant_portfolio`. No DROP needed → preserves dependents like `v_dashboard_attention_ranked`.

### Migration SQL

```sql
-- 1. v_tenant_last_activity: add time_entries to GREATEST()
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

-- 2. v_dashboard_tenant_portfolio: status filter + time_entries + client_action_items
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
       COALESCE(t.risk_level, 'stable') AS risk_status,
       COALESCE(ri.risk_index, 0) AS risk_index,
       0 AS risk_index_delta_14d,
       COALESCE(sh.worst_health, 'healthy') AS worst_stage_health_status,
       (COALESCE(sh.critical_count, 0))::integer AS critical_stage_count,
       (COALESCE(sh.at_risk_count, 0))::integer  AS at_risk_stage_count,
       (COALESCE(tk.open_count, 0))::integer     AS open_tasks_count,
       (COALESCE(tk.overdue_count, 0))::integer  AS overdue_tasks_count,
       COALESCE(eg.mandatory_gaps, 0) AS mandatory_gaps_count,
       COALESCE(cl.hours_30d, 0::numeric) AS consult_hours_30d,
       COALESCE(bf.burn_risk_status, 'normal') AS burn_risk_status,
       bf.projected_exhaustion_date,
       COALESCE(rf.retention_status, 'stable') AS retention_status,
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
  SELECT (COALESCE(sum(jsonb_array_length(egc.missing_categories_json)), 0))::integer AS mandatory_gaps,
         max(egc.created_at) AS latest_gap_at
  FROM public.evidence_gap_checks egc WHERE egc.tenant_id = t.id AND egc.status = 'gaps_found'
) eg ON true
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(te.duration_minutes) / 60.0, 0) AS hours_30d
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
```

### Notes / nuances
- `CREATE OR REPLACE VIEW` requires identical column list/types — preserved exactly (same 25 cols, same order, same casts). Dependents (`v_dashboard_attention_ranked`) keep working without recreation.
- The `cl` lateral originally exposed `latest_consult_at` internally but it was never selected — dropped silently. The new version omits it; column list unchanged.
- `time_entries.duration_minutes` divided by `6.0` gives numeric hours; cast compatible with existing `numeric` output type.
- `client_action_items.completed_at IS NULL` = open; `due_date < CURRENT_DATE` for overdue (date vs date, avoids tz drift unlike the previous `< now()` on a date column).
- Both views are `SECURITY INVOKER` by default and run under caller RLS — unchanged.
- Aligns with Core memory: "Globally exclude 'test' clients and ensure `status = 'active'` filters for operational views."

### Verification (run after apply)
```sql
SELECT tenant_name, consult_hours_30d, open_tasks_count, days_since_activity
FROM public.v_dashboard_attention_ranked
ORDER BY consult_hours_30d DESC LIMIT 10;

SELECT COUNT(*) FROM public.v_dashboard_attention_ranked;  -- expect ~61
```

### Risk
Very low. Read-only views, no table/policy/grant/code changes. Fully reversible by re-applying the prior definitions. Slight perf change: lateral on `time_entries` and `client_action_items` should be indexed by `tenant_id` (verify post-deploy if slow).
