CREATE OR REPLACE VIEW public.v_dashboard_behavioural_prompts AS
SELECT ('no-consult-30d-' || p.tenant_id) AS item_id,
    'behavioural_prompt' AS item_type,
    'moderate' AS severity,
    p.tenant_id,
    NULL::text AS stage_instance_id,
    NULL::text AS standard_clause,
    ('No consult logged in 30 days – ' || p.tenant_name) AS summary,
    p.assigned_csc_user_id AS owner_user_id,
    now() AS created_at,
    'No consulting activity recorded in the past 30 days. Consider scheduling a check-in.' AS why_text
   FROM v_dashboard_tenant_portfolio p
  WHERE p.consult_hours_30d = 0
    AND p.tenant_status = 'active'
UNION ALL
 SELECT ('inactive-21d-' || p.tenant_id) AS item_id,
    'behavioural_prompt' AS item_type,
    'moderate' AS severity,
    p.tenant_id,
    NULL::text AS stage_instance_id,
    NULL::text AS standard_clause,
    ('Low engagement – ' || p.tenant_name || ' (' || COALESCE(EXTRACT(epoch FROM (now() - p.last_activity_at)) / 86400, 999)::integer || 'd inactive)') AS summary,
    p.assigned_csc_user_id AS owner_user_id,
    now() AS created_at,
    'No task updates, uploads, or notes for over 21 days. May indicate a hidden blocker.' AS why_text
   FROM v_dashboard_tenant_portfolio p
  WHERE COALESCE(EXTRACT(epoch FROM (now() - p.last_activity_at)) / 86400, 999) > 21
    AND p.tenant_status = 'active'
UNION ALL
 SELECT ('gap-check-60d-' || p.tenant_id) AS item_id,
    'behavioural_prompt' AS item_type,
    'moderate' AS severity,
    p.tenant_id,
    NULL::text AS stage_instance_id,
    NULL::text AS standard_clause,
    ('Evidence gap check overdue – ' || p.tenant_name) AS summary,
    p.assigned_csc_user_id AS owner_user_id,
    now() AS created_at,
    'No evidence gap analysis run recently. Mandatory categories may have drifted.' AS why_text
   FROM v_dashboard_tenant_portfolio p
  WHERE p.mandatory_gaps_count > 0
    AND COALESCE(EXTRACT(epoch FROM (now() - p.last_activity_at)) / 86400, 999) > 14
    AND p.tenant_status = 'active';