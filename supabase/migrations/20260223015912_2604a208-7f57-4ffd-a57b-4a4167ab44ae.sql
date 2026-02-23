
-- Organisation Type lookup
CREATE TABLE public.dd_org_type (
  id SERIAL PRIMARY KEY,
  value TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.dd_org_type ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dd_org_type_read" ON public.dd_org_type FOR SELECT USING (true);
CREATE POLICY "dd_org_type_admin" ON public.dd_org_type FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE user_uuid = auth.uid() AND unicorn_role = 'Super Admin')
);

-- Student Management System lookup
CREATE TABLE public.dd_sms (
  id SERIAL PRIMARY KEY,
  value TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.dd_sms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dd_sms_read" ON public.dd_sms FOR SELECT USING (true);
CREATE POLICY "dd_sms_admin" ON public.dd_sms FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE user_uuid = auth.uid() AND unicorn_role = 'Super Admin')
);

-- Learning Management System lookup
CREATE TABLE public.dd_lms (
  id SERIAL PRIMARY KEY,
  value TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.dd_lms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dd_lms_read" ON public.dd_lms FOR SELECT USING (true);
CREATE POLICY "dd_lms_admin" ON public.dd_lms FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE user_uuid = auth.uid() AND unicorn_role = 'Super Admin')
);

-- Accounting System lookup
CREATE TABLE public.dd_accounting_system (
  id SERIAL PRIMARY KEY,
  value TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.dd_accounting_system ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dd_accounting_system_read" ON public.dd_accounting_system FOR SELECT USING (true);
CREATE POLICY "dd_accounting_system_admin" ON public.dd_accounting_system FOR ALL USING (
  EXISTS (SELECT 1 FROM public.users WHERE user_uuid = auth.uid() AND unicorn_role = 'Super Admin')
);

-- Seed Organisation Types
INSERT INTO public.dd_org_type (value, label, sort_order) VALUES
  ('rto', 'RTO', 1),
  ('cricos', 'CRICOS Provider', 2),
  ('gto', 'GTO', 3),
  ('rto_cricos', 'RTO + CRICOS', 4),
  ('other', 'Other', 5);

-- Seed Student Management Systems
INSERT INTO public.dd_sms (value, label, sort_order) VALUES
  ('axcelerate', 'aXcelerate', 1),
  ('wisenet', 'Wisenet', 2),
  ('vettrak', 'VETtrak', 3),
  ('jobready', 'Jobready', 4),
  ('rtomanager', 'RTO Manager', 5),
  ('cloud_assess', 'Cloud Assess', 6),
  ('other', 'Other', 7);

-- Seed Learning Management Systems
INSERT INTO public.dd_lms (value, label, sort_order) VALUES
  ('moodle', 'Moodle', 1),
  ('canvas', 'Canvas', 2),
  ('blackboard', 'Blackboard', 3),
  ('axcelerate', 'aXcelerate', 4),
  ('totara', 'Totara', 5),
  ('other', 'Other', 6);

-- Seed Accounting Systems
INSERT INTO public.dd_accounting_system (value, label, sort_order) VALUES
  ('xero', 'Xero', 1),
  ('myob', 'MYOB', 2),
  ('quickbooks', 'QuickBooks', 3),
  ('sage', 'Sage', 4),
  ('other', 'Other', 5);
