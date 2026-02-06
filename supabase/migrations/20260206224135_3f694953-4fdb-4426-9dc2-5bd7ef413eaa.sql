-- ============================================================
-- Security Fix: Convert SECURITY DEFINER views to SECURITY INVOKER
-- Issue: SUPA_security_definer_view
-- ============================================================

-- 1. Fix dashboard_client_snapshot (has security_invoker=on instead of =true)
DROP VIEW IF EXISTS public.dashboard_client_snapshot;

CREATE VIEW public.dashboard_client_snapshot
WITH (security_invoker = true)
AS
SELECT 
    c.id,
    c.rto_name,
    c.framework,
    c.package_type,
    c.audit_due,
    c.risk_level,
    c.tailoring_complete,
    c.untailored_documents,
    c.trainer_credential_status,
    COALESCE(sum(cl.hours), 0::numeric) AS consult_hours,
    count(DISTINCT rf.flag_id) AS risk_flags_count,
    CASE
        WHEN c.audit_due IS NOT NULL AND c.audit_due <= (CURRENT_DATE + '7 days'::interval) AND c.tailoring_complete < 50 THEN 100
        WHEN c.audit_due IS NOT NULL AND c.audit_due <= (CURRENT_DATE + '7 days'::interval) THEN 75
        WHEN c.tailoring_complete < 50 THEN 60
        WHEN c.audit_due IS NOT NULL AND c.audit_due <= (CURRENT_DATE + '14 days'::interval) THEN 40
        WHEN c.tailoring_complete < 80 THEN 40
        ELSE 0
    END AS risk_score,
    CASE
        WHEN c.audit_due IS NOT NULL AND c.audit_due <= (CURRENT_DATE + '14 days'::interval) THEN true
        WHEN c.tailoring_complete < 80 THEN true
        WHEN count(DISTINCT rf.flag_id) > 0 THEN true
        ELSE false
    END AS at_risk
FROM public.clients_legacy c
LEFT JOIN public.consult_logs cl ON cl.client_id = c.id
LEFT JOIN public.risk_flags rf ON rf.client_id = c.id
GROUP BY c.id, c.rto_name, c.framework, c.package_type, c.audit_due, c.risk_level, c.tailoring_complete, c.untailored_documents, c.trainer_credential_status;

-- 2. Fix v_tenant_compliance_entitlements (missing security_invoker option)
DROP VIEW IF EXISTS public.v_tenant_compliance_entitlements;

CREATE VIEW public.v_tenant_compliance_entitlements
WITH (security_invoker = true)
AS
SELECT 
    t.id AS tenant_id,
    t.name AS tenant_name,
    cp.code AS effective_plan_code,
    cp.name AS effective_plan_name,
    tcm.status AS membership_status,
    tcm.start_date,
    tcm.end_date,
    tcm.billing_model,
    COALESCE(tcm.included_hours_month, cp.default_included_hours_month) AS effective_included_hours_month,
    COALESCE(tsi.included_hours, 0::numeric) AS period_bonus_hours,
    COALESCE(tsi.rollover_hours, 0::numeric) AS rollover_hours,
    COALESCE(tcm.included_hours_month, cp.default_included_hours_month) + COALESCE(tsi.included_hours, 0::numeric) + COALESCE(tsi.rollover_hours, 0::numeric) AS total_available_hours,
    COALESCE(tcm.billable_rate, cp.default_billable_rate) AS effective_billable_rate,
    COALESCE(tcm.response_sla_id, cp.default_response_sla_id) AS effective_response_sla_id,
    COALESCE(tcm.resolution_sla_id, cp.default_resolution_sla_id) AS effective_resolution_sla_id,
    COALESCE(cp.feature_flags || COALESCE(tcm.feature_flags_override, '{}'::jsonb), cp.feature_flags) AS effective_feature_flags,
    COALESCE(cp.limits || COALESCE(tcm.limits_override, '{}'::jsonb), cp.limits) AS effective_limits,
    tcm.assigned_csc_user_id,
    tcm.assigned_team_leader_user_id
FROM public.tenants t
JOIN public.tenant_compliance_memberships tcm ON tcm.tenant_id = t.id
JOIN public.compliance_plans cp ON cp.id = tcm.plan_id
LEFT JOIN public.tenant_support_inclusions tsi ON tsi.tenant_id = t.id 
    AND CURRENT_DATE >= tsi.period_start 
    AND CURRENT_DATE <= tsi.period_end
WHERE tcm.status = 'active'::text 
    AND t.tenant_type = 'compliance_system'::tenant_type;