
-- v_dashboard_priority_inbox view (fixed types)
CREATE OR REPLACE VIEW public.v_dashboard_priority_inbox
WITH (security_invoker = true)
AS
SELECT id AS item_id, 'risk_alert'::text AS item_type,
  severity, tenant_id, NULL::uuid AS stage_instance_id,
  NULL::text AS standard_clause, alert_summary AS summary,
  NULL::uuid AS owner_user_id, created_at
FROM public.real_time_risk_alerts
WHERE resolved_flag = false AND archived_flag = false

UNION ALL

SELECT sub.id AS item_id, 'stage_health'::text AS item_type,
  CASE WHEN sub.health_status = 'critical' THEN 'critical'::text ELSE 'high'::text END AS severity,
  sub.tenant_id, NULL::uuid AS stage_instance_id, NULL::text AS standard_clause,
  ('Stage health: ' || sub.health_status)::text AS summary,
  NULL::uuid AS owner_user_id, sub.generated_at AS created_at
FROM (
  SELECT DISTINCT ON (sh.stage_instance_id) sh.id, sh.tenant_id, sh.stage_instance_id, sh.health_status, sh.generated_at
  FROM public.stage_health_snapshots sh
  WHERE sh.health_status IN ('at_risk', 'critical')
  ORDER BY sh.stage_instance_id, sh.generated_at DESC
) sub

UNION ALL

SELECT eg.id AS item_id, 'evidence_gap'::text AS item_type,
  'high'::text AS severity, eg.tenant_id, NULL::uuid AS stage_instance_id,
  NULL::text AS standard_clause,
  ('Mandatory evidence gaps: ' || COALESCE(jsonb_array_length(eg.missing_categories_json), 0))::text AS summary,
  NULL::uuid AS owner_user_id, eg.created_at
FROM public.evidence_gap_checks eg
WHERE eg.status = 'gaps_found'

UNION ALL

SELECT bf.id AS item_id, 'burn_risk'::text AS item_type,
  'critical'::text AS severity, bf.tenant_id, NULL::uuid AS stage_instance_id,
  NULL::text AS standard_clause,
  ('Hours exhaustion projected: ' || COALESCE(bf.projected_exhaustion_date::text, 'unknown'))::text AS summary,
  NULL::uuid AS owner_user_id, bf.generated_at AS created_at
FROM public.tenant_package_burn_forecast bf
WHERE bf.burn_risk_status = 'critical'

UNION ALL

SELECT rf.id AS item_id, 'retention_risk'::text AS item_type,
  CASE WHEN rf.retention_status = 'high_risk' THEN 'critical'::text ELSE 'high'::text END AS severity,
  rf.tenant_id, NULL::uuid AS stage_instance_id,
  NULL::text AS standard_clause,
  ('Retention risk: ' || rf.retention_status)::text AS summary,
  NULL::uuid AS owner_user_id, rf.generated_at AS created_at
FROM public.tenant_retention_forecasts rf
WHERE rf.retention_status IN ('vulnerable', 'high_risk')

UNION ALL

SELECT rce.id AS item_id, 'regulator_change'::text AS item_type,
  CASE WHEN rce.impact_level = 'critical' THEN 'critical'::text
       WHEN rce.impact_level = 'high' THEN 'high'::text ELSE 'moderate'::text END AS severity,
  NULL::bigint AS tenant_id, NULL::uuid AS stage_instance_id,
  NULL::text AS standard_clause,
  ('Regulator change: ' || LEFT(COALESCE(rce.change_summary_md, ''), 80))::text AS summary,
  NULL::uuid AS owner_user_id, rce.created_at
FROM public.regulator_change_events rce
WHERE rce.review_status = 'pending'

UNION ALL

SELECT pa.id AS item_id, 'playbook_suggested'::text AS item_type,
  'moderate'::text AS severity, pa.tenant_id, pa.stage_instance_id,
  NULL::text AS standard_clause,
  ('Playbook suggested: ' || COALESCE(pa.activation_reason, ''))::text AS summary,
  NULL::uuid AS owner_user_id, pa.activated_at AS created_at
FROM public.playbook_activations pa
WHERE pa.activation_status = 'suggested';

-- v_dashboard_tenant_recent_comms view
CREATE OR REPLACE VIEW public.v_dashboard_tenant_recent_comms
WITH (security_invoker = true)
AS
WITH ranked_notes AS (
  SELECT n.tenant_id, n.id, n.created_at, n.created_by, n.note_type, n.title,
    LEFT(n.note_details, 120) AS preview,
    ROW_NUMBER() OVER (PARTITION BY n.tenant_id ORDER BY n.created_at DESC) AS rn
  FROM public.notes n
)
SELECT
  t.id AS tenant_id,
  COALESCE(
    (SELECT jsonb_agg(jsonb_build_object(
      'id', rn2.id, 'created_at', rn2.created_at, 'author_id', rn2.created_by,
      'type', rn2.note_type, 'title', rn2.title, 'preview', rn2.preview
    ) ORDER BY rn2.created_at DESC)
    FROM ranked_notes rn2 WHERE rn2.tenant_id = t.id AND rn2.rn <= 5),
    '[]'::jsonb
  ) AS recent_notes_json,
  '[]'::jsonb AS recent_emails_json
FROM public.tenants t
WHERE t.status = 'active';

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_risk_events_tenant_created ON public.risk_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stage_health_tenant_stage ON public.stage_health_snapshots(tenant_id, stage_instance_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_tenant_created ON public.notes(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_real_time_risk_alerts_resolved ON public.real_time_risk_alerts(resolved_flag, archived_flag);
