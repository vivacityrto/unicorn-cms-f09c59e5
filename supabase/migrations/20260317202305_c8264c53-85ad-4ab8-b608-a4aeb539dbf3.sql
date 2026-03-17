
-- =============================================
-- dd_lifecycle_type
-- =============================================
CREATE SEQUENCE IF NOT EXISTS dd_lifecycle_type_id_seq;

CREATE TABLE public.dd_lifecycle_type (
  id integer NOT NULL DEFAULT nextval('dd_lifecycle_type_id_seq') PRIMARY KEY,
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

ALTER SEQUENCE dd_lifecycle_type_id_seq OWNED BY dd_lifecycle_type.id;
ALTER TABLE public.dd_lifecycle_type ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read dd_lifecycle_type"
  ON public.dd_lifecycle_type FOR SELECT TO authenticated USING (true);

CREATE POLICY "Vivacity staff can manage dd_lifecycle_type"
  ON public.dd_lifecycle_type FOR ALL TO authenticated
  USING (public.is_vivacity_staff(auth.uid()));

-- =============================================
-- dd_lifecycle_responsible_role
-- =============================================
CREATE SEQUENCE IF NOT EXISTS dd_lifecycle_responsible_role_id_seq;

CREATE TABLE public.dd_lifecycle_responsible_role (
  id integer NOT NULL DEFAULT nextval('dd_lifecycle_responsible_role_id_seq') PRIMARY KEY,
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

ALTER SEQUENCE dd_lifecycle_responsible_role_id_seq OWNED BY dd_lifecycle_responsible_role.id;
ALTER TABLE public.dd_lifecycle_responsible_role ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read dd_lifecycle_responsible_role"
  ON public.dd_lifecycle_responsible_role FOR SELECT TO authenticated USING (true);

CREATE POLICY "Vivacity staff can manage dd_lifecycle_responsible_role"
  ON public.dd_lifecycle_responsible_role FOR ALL TO authenticated
  USING (public.is_vivacity_staff(auth.uid()));

-- =============================================
-- dd_lifecycle_category
-- =============================================
CREATE SEQUENCE IF NOT EXISTS dd_lifecycle_category_id_seq;

CREATE TABLE public.dd_lifecycle_category (
  id integer NOT NULL DEFAULT nextval('dd_lifecycle_category_id_seq') PRIMARY KEY,
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

ALTER SEQUENCE dd_lifecycle_category_id_seq OWNED BY dd_lifecycle_category.id;
ALTER TABLE public.dd_lifecycle_category ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read dd_lifecycle_category"
  ON public.dd_lifecycle_category FOR SELECT TO authenticated USING (true);

CREATE POLICY "Vivacity staff can manage dd_lifecycle_category"
  ON public.dd_lifecycle_category FOR ALL TO authenticated
  USING (public.is_vivacity_staff(auth.uid()));

-- =============================================
-- lifecycle_checklist_templates
-- =============================================
CREATE TABLE public.lifecycle_checklist_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lifecycle_type text NOT NULL,
  category text NOT NULL,
  step_title text NOT NULL,
  description text,
  responsible_role text,
  default_assignee_id uuid REFERENCES public.users(user_uuid),
  external_link text,
  sort_order integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lifecycle_checklist_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vivacity staff can read lifecycle_checklist_templates"
  ON public.lifecycle_checklist_templates FOR SELECT TO authenticated
  USING (public.is_vivacity_staff(auth.uid()));

CREATE POLICY "Vivacity staff can manage lifecycle_checklist_templates"
  ON public.lifecycle_checklist_templates FOR ALL TO authenticated
  USING (public.is_vivacity_staff(auth.uid()));

CREATE INDEX idx_lct_lifecycle_type ON public.lifecycle_checklist_templates(lifecycle_type);
CREATE INDEX idx_lct_category ON public.lifecycle_checklist_templates(category);

CREATE TRIGGER update_lifecycle_checklist_templates_updated_at
  BEFORE UPDATE ON public.lifecycle_checklist_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- lifecycle_checklist_instances
-- =============================================
CREATE TABLE public.lifecycle_checklist_instances (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id uuid NOT NULL REFERENCES public.lifecycle_checklist_templates(id),
  lifecycle_type text NOT NULL,
  tenant_id integer REFERENCES public.tenants(id),
  target_user_id uuid REFERENCES public.users(user_uuid),
  package_instance_id bigint,
  assigned_to uuid REFERENCES public.users(user_uuid),
  completed boolean NOT NULL DEFAULT false,
  completed_by uuid REFERENCES public.users(user_uuid),
  completed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lifecycle_checklist_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vivacity staff can read lifecycle_checklist_instances"
  ON public.lifecycle_checklist_instances FOR SELECT TO authenticated
  USING (public.is_vivacity_staff(auth.uid()));

CREATE POLICY "Vivacity staff can manage lifecycle_checklist_instances"
  ON public.lifecycle_checklist_instances FOR ALL TO authenticated
  USING (public.is_vivacity_staff(auth.uid()));

CREATE INDEX idx_lci_lifecycle_type ON public.lifecycle_checklist_instances(lifecycle_type);
CREATE INDEX idx_lci_tenant_id ON public.lifecycle_checklist_instances(tenant_id);
CREATE INDEX idx_lci_target_user_id ON public.lifecycle_checklist_instances(target_user_id);
CREATE INDEX idx_lci_template_id ON public.lifecycle_checklist_instances(template_id);

-- =============================================
-- Seed lookup tables
-- =============================================
INSERT INTO public.dd_lifecycle_type (code, label, sort_order) VALUES
  ('client_onboarding', 'Client Onboarding', 1),
  ('client_offboarding', 'Client Offboarding', 2),
  ('staff_onboarding', 'Staff Onboarding', 3),
  ('staff_offboarding', 'Staff Offboarding', 4);

INSERT INTO public.dd_lifecycle_responsible_role (code, label, sort_order) VALUES
  ('super_admin', 'Super Admin', 1),
  ('operations', 'Operations', 2),
  ('csc', 'CSC', 3),
  ('team_leader', 'Team Leader', 4);

INSERT INTO public.dd_lifecycle_category (code, label, sort_order) VALUES
  ('staff_details', 'Staff Details', 1),
  ('m365_groups', 'M365 Groups', 2),
  ('m365_licenses', 'M365 Licenses', 3),
  ('software_logins', 'Software & Logins', 4),
  ('calendar_invitations', 'Calendar Invitations', 5),
  ('crm', 'CRM', 6),
  ('training_portal', 'Training Portal', 7),
  ('external_comms', 'External Communications', 8);
