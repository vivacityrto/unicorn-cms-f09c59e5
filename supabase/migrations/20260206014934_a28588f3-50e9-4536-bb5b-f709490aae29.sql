-- =============================================
-- COMPLIANCE PLAN METADATA SCHEMA - FULL
-- =============================================

-- 1) SLA Policies
CREATE TABLE public.sla_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  first_response_hours integer NOT NULL,
  update_frequency_hours integer NULL,
  target_resolution_hours integer NULL,
  business_hours_only boolean NOT NULL DEFAULT true,
  business_hours_timezone text NOT NULL DEFAULT 'Australia/Sydney',
  business_hours jsonb NOT NULL DEFAULT '{"weekdays": [1,2,3,4,5], "start": "09:00", "end": "17:00"}'::jsonb,
  exclusions jsonb NOT NULL DEFAULT '{"regions": ["AU"]}'::jsonb,
  severity_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES auth.users(id)
);

-- 2) Compliance Plans
CREATE TABLE public.compliance_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  default_included_hours_month numeric(6,2) NOT NULL DEFAULT 0,
  default_billable_rate numeric(10,2) NULL,
  default_response_sla_id uuid NULL REFERENCES public.sla_policies(id),
  default_resolution_sla_id uuid NULL REFERENCES public.sla_policies(id),
  feature_flags jsonb NOT NULL DEFAULT '{"documents": true, "resource_hub": true, "academy_access": true}'::jsonb,
  limits jsonb NOT NULL DEFAULT '{"max_client_users": null, "max_packages": null}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES auth.users(id)
);

-- 3) Tenant Compliance Memberships
CREATE TABLE public.tenant_compliance_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.compliance_plans(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
  start_date date NOT NULL DEFAULT current_date,
  end_date date NULL,
  billing_model text NOT NULL DEFAULT 'invoice' CHECK (billing_model IN ('invoice', 'card_link', 'hybrid')),
  included_hours_month numeric(6,2) NULL,
  billable_rate numeric(10,2) NULL,
  response_sla_id uuid NULL REFERENCES public.sla_policies(id),
  resolution_sla_id uuid NULL REFERENCES public.sla_policies(id),
  feature_flags_override jsonb NULL,
  limits_override jsonb NULL,
  assigned_csc_user_id uuid NULL REFERENCES public.users(user_uuid),
  assigned_team_leader_user_id uuid NULL REFERENCES public.users(user_uuid),
  notes_internal text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES auth.users(id),
  CONSTRAINT unique_active_membership UNIQUE (tenant_id, plan_id, start_date)
);

-- 4) Tenant Support Inclusions
CREATE TABLE public.tenant_support_inclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  included_hours numeric(6,2) NOT NULL,
  rollover_hours numeric(6,2) NOT NULL DEFAULT 0,
  rollover_expiry_date date NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES auth.users(id),
  CONSTRAINT valid_period CHECK (period_end >= period_start)
);

-- 5) Support Requests
CREATE TABLE public.support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requested_by_user_id uuid NOT NULL REFERENCES public.users(user_uuid),
  assigned_to_user_id uuid NULL REFERENCES public.users(user_uuid),
  type text NOT NULL CHECK (type IN ('audit_support', 'doc_review', 'advice', 'training', 'general')),
  severity text NOT NULL DEFAULT 'p3' CHECK (severity IN ('p1', 'p2', 'p3', 'p4')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'blocked', 'resolved', 'closed')),
  title text NOT NULL,
  description text NULL,
  first_response_due_at timestamptz NULL,
  resolution_due_at timestamptz NULL,
  first_response_at timestamptz NULL,
  resolved_at timestamptz NULL,
  closed_at timestamptz NULL,
  source text NOT NULL DEFAULT 'portal' CHECK (source IN ('portal', 'email_logged', 'meeting', 'phone')),
  sla_breached boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES auth.users(id)
);

-- 6) Consult Time Entries
CREATE TABLE public.consult_time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(user_uuid),
  minutes integer NOT NULL,
  description text NULL,
  package_id integer NULL,
  is_billable boolean NOT NULL DEFAULT false,
  billing_reason text NULL,
  counts_toward_included_hours boolean NOT NULL DEFAULT true,
  support_request_id uuid NULL REFERENCES public.support_requests(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES auth.users(id)
);

-- INDEXES
CREATE INDEX idx_compliance_plans_status ON public.compliance_plans(status);
CREATE INDEX idx_sla_policies_code ON public.sla_policies(code);
CREATE INDEX idx_tenant_compliance_memberships_tenant ON public.tenant_compliance_memberships(tenant_id);
CREATE INDEX idx_tenant_compliance_memberships_status ON public.tenant_compliance_memberships(status);
CREATE INDEX idx_tenant_support_inclusions_tenant ON public.tenant_support_inclusions(tenant_id);
CREATE INDEX idx_tenant_support_inclusions_period ON public.tenant_support_inclusions(period_start, period_end);
CREATE INDEX idx_support_requests_tenant ON public.support_requests(tenant_id);
CREATE INDEX idx_support_requests_status ON public.support_requests(status);
CREATE INDEX idx_support_requests_severity ON public.support_requests(severity);
CREATE INDEX idx_support_requests_assigned ON public.support_requests(assigned_to_user_id);
CREATE INDEX idx_consult_time_entries_tenant ON public.consult_time_entries(tenant_id);
CREATE INDEX idx_consult_time_entries_support_request ON public.consult_time_entries(support_request_id);

-- VIEW
CREATE OR REPLACE VIEW public.v_tenant_compliance_entitlements AS
SELECT 
  t.id AS tenant_id, t.name AS tenant_name, cp.code AS effective_plan_code, cp.name AS effective_plan_name,
  tcm.status AS membership_status, tcm.start_date, tcm.end_date, tcm.billing_model,
  COALESCE(tcm.included_hours_month, cp.default_included_hours_month) AS effective_included_hours_month,
  COALESCE(tsi.included_hours, 0) AS period_bonus_hours, COALESCE(tsi.rollover_hours, 0) AS rollover_hours,
  COALESCE(tcm.included_hours_month, cp.default_included_hours_month) + COALESCE(tsi.included_hours, 0) + COALESCE(tsi.rollover_hours, 0) AS total_available_hours,
  COALESCE(tcm.billable_rate, cp.default_billable_rate) AS effective_billable_rate,
  COALESCE(tcm.response_sla_id, cp.default_response_sla_id) AS effective_response_sla_id,
  COALESCE(tcm.resolution_sla_id, cp.default_resolution_sla_id) AS effective_resolution_sla_id,
  COALESCE(cp.feature_flags || COALESCE(tcm.feature_flags_override, '{}'::jsonb), cp.feature_flags) AS effective_feature_flags,
  COALESCE(cp.limits || COALESCE(tcm.limits_override, '{}'::jsonb), cp.limits) AS effective_limits,
  tcm.assigned_csc_user_id, tcm.assigned_team_leader_user_id
FROM public.tenants t
INNER JOIN public.tenant_compliance_memberships tcm ON tcm.tenant_id = t.id
INNER JOIN public.compliance_plans cp ON cp.id = tcm.plan_id
LEFT JOIN public.tenant_support_inclusions tsi ON tsi.tenant_id = t.id AND current_date BETWEEN tsi.period_start AND tsi.period_end
WHERE tcm.status = 'active' AND t.tenant_type = 'compliance_system';

-- RLS
ALTER TABLE public.sla_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_compliance_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_support_inclusions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consult_time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vivacity team can view SLA policies" ON public.sla_policies FOR SELECT USING (EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid = auth.uid() AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')));
CREATE POLICY "Super Admin can manage SLA policies" ON public.sla_policies FOR ALL USING (EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid = auth.uid() AND u.unicorn_role = 'Super Admin'));
CREATE POLICY "Vivacity team can view compliance plans" ON public.compliance_plans FOR SELECT USING (EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid = auth.uid() AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')));
CREATE POLICY "Super Admin can manage compliance plans" ON public.compliance_plans FOR ALL USING (EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid = auth.uid() AND u.unicorn_role = 'Super Admin'));
CREATE POLICY "Clients can view their own membership" ON public.tenant_compliance_memberships FOR SELECT USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active'));
CREATE POLICY "Vivacity team can view all memberships" ON public.tenant_compliance_memberships FOR SELECT USING (EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid = auth.uid() AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')));
CREATE POLICY "Super Admin can manage memberships" ON public.tenant_compliance_memberships FOR ALL USING (EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid = auth.uid() AND u.unicorn_role = 'Super Admin'));
CREATE POLICY "Clients can view their own inclusions" ON public.tenant_support_inclusions FOR SELECT USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active'));
CREATE POLICY "Vivacity team can view all inclusions" ON public.tenant_support_inclusions FOR SELECT USING (EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid = auth.uid() AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')));
CREATE POLICY "Super Admin can manage inclusions" ON public.tenant_support_inclusions FOR ALL USING (EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid = auth.uid() AND u.unicorn_role = 'Super Admin'));
CREATE POLICY "Clients can view their tenant support requests" ON public.support_requests FOR SELECT USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active'));
CREATE POLICY "Clients can create support requests" ON public.support_requests FOR INSERT WITH CHECK (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active'));
CREATE POLICY "Vivacity team can view all support requests" ON public.support_requests FOR SELECT USING (EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid = auth.uid() AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')));
CREATE POLICY "Vivacity team can manage support requests" ON public.support_requests FOR ALL USING (EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid = auth.uid() AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')));
CREATE POLICY "Clients can view their tenant time entries" ON public.consult_time_entries FOR SELECT USING (tenant_id IN (SELECT tm.tenant_id FROM public.tenant_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active'));
CREATE POLICY "Vivacity team can manage time entries" ON public.consult_time_entries FOR ALL USING (EXISTS (SELECT 1 FROM public.users u WHERE u.user_uuid = auth.uid() AND u.unicorn_role IN ('Super Admin', 'Team Leader', 'Team Member')));

-- AUDIT (corrected for uuid entity_id)
CREATE OR REPLACE FUNCTION public.log_compliance_audit_event() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_events (action, entity, entity_id, user_id, details)
  VALUES (TG_OP, TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), auth.uid(), 
    jsonb_build_object('old', CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END, 
                       'new', CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER audit_compliance_plans AFTER INSERT OR UPDATE OR DELETE ON public.compliance_plans FOR EACH ROW EXECUTE FUNCTION public.log_compliance_audit_event();
CREATE TRIGGER audit_sla_policies AFTER INSERT OR UPDATE OR DELETE ON public.sla_policies FOR EACH ROW EXECUTE FUNCTION public.log_compliance_audit_event();
CREATE TRIGGER audit_tenant_compliance_memberships AFTER INSERT OR UPDATE OR DELETE ON public.tenant_compliance_memberships FOR EACH ROW EXECUTE FUNCTION public.log_compliance_audit_event();
CREATE TRIGGER audit_tenant_support_inclusions AFTER INSERT OR UPDATE OR DELETE ON public.tenant_support_inclusions FOR EACH ROW EXECUTE FUNCTION public.log_compliance_audit_event();

CREATE OR REPLACE FUNCTION public.update_compliance_membership_timestamp() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); NEW.updated_by = auth.uid(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER set_membership_updated_at BEFORE UPDATE ON public.tenant_compliance_memberships FOR EACH ROW EXECUTE FUNCTION public.update_compliance_membership_timestamp();

-- SEEDS
INSERT INTO public.sla_policies (code, name, first_response_hours, target_resolution_hours, severity_overrides) VALUES
  ('SLA_STD_48H', 'Standard 48-Hour Response', 48, 120, '{"p1": {"first_response_hours": 4, "target_resolution_hours": 24}, "p2": {"first_response_hours": 8, "target_resolution_hours": 48}}'::jsonb),
  ('SLA_PRIORITY_24H', 'Priority 24-Hour Response', 24, 72, '{"p1": {"first_response_hours": 2, "target_resolution_hours": 8}, "p2": {"first_response_hours": 4, "target_resolution_hours": 24}}'::jsonb),
  ('SLA_ELITE_8H', 'Elite 8-Hour Response', 8, 48, '{"p1": {"first_response_hours": 1, "target_resolution_hours": 4}, "p2": {"first_response_hours": 2, "target_resolution_hours": 12}}'::jsonb);

INSERT INTO public.compliance_plans (code, name, description, default_included_hours_month, default_response_sla_id, feature_flags, limits) 
SELECT 'COMP_CORE', 'Compliance Core', 'Essential compliance management with standard support', 4, 
  (SELECT id FROM public.sla_policies WHERE code = 'SLA_STD_48H'),
  '{"documents": true, "resource_hub": true, "academy_access": true}'::jsonb, '{"max_client_users": null, "max_packages": 10}'::jsonb;

INSERT INTO public.compliance_plans (code, name, description, default_included_hours_month, default_response_sla_id, feature_flags, limits) 
SELECT 'COMP_PRO', 'Compliance Pro', 'Professional compliance with priority support', 8,
  (SELECT id FROM public.sla_policies WHERE code = 'SLA_PRIORITY_24H'),
  '{"documents": true, "resource_hub": true, "academy_access": true}'::jsonb, '{"max_client_users": null, "max_packages": null}'::jsonb;

INSERT INTO public.compliance_plans (code, name, description, default_included_hours_month, default_response_sla_id, feature_flags, limits) 
SELECT 'COMP_ELITE', 'Compliance Elite', 'Premium compliance with dedicated support', 16,
  (SELECT id FROM public.sla_policies WHERE code = 'SLA_ELITE_8H'),
  '{"documents": true, "resource_hub": true, "academy_access": true}'::jsonb, '{"max_client_users": null, "max_packages": null}'::jsonb;