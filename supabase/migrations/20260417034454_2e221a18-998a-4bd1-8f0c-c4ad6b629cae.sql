
-- ============================================================
-- Staff Provisioning Rules + Lookups (New Starter Wizard)
-- ============================================================

-- 1. Lookup: dd_staff_role
CREATE TABLE IF NOT EXISTS public.dd_staff_role (
  id          bigserial PRIMARY KEY,
  code        text NOT NULL UNIQUE,
  label       text NOT NULL,
  description text,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dd_staff_role ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dd_staff_role read all auth"
  ON public.dd_staff_role FOR SELECT TO authenticated USING (true);
CREATE POLICY "dd_staff_role manage vivacity"
  ON public.dd_staff_role FOR ALL TO authenticated
  USING (public.is_vivacity()) WITH CHECK (public.is_vivacity());

INSERT INTO public.dd_staff_role (code, label, sort_order) VALUES
  ('consultant',         'Consultant',          10),
  ('senior_consultant',  'Senior Consultant',   20),
  ('admin_assistant',    'Admin Assistant',     30),
  ('client_success',     'Client Success',      40),
  ('client_experience',  'Client Experience',   50),
  ('business_growth',    'Business Growth',     60),
  ('software_developer', 'Software Developer',  70),
  ('leadership',         'Leadership',          80)
ON CONFLICT (code) DO NOTHING;

-- 2. Lookup: dd_staff_location (AU / PH)
CREATE TABLE IF NOT EXISTS public.dd_staff_location (
  id          bigserial PRIMARY KEY,
  code        text NOT NULL UNIQUE,
  label       text NOT NULL,
  description text,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dd_staff_location ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dd_staff_location read all auth"
  ON public.dd_staff_location FOR SELECT TO authenticated USING (true);
CREATE POLICY "dd_staff_location manage vivacity"
  ON public.dd_staff_location FOR ALL TO authenticated
  USING (public.is_vivacity()) WITH CHECK (public.is_vivacity());

INSERT INTO public.dd_staff_location (code, label, description, sort_order) VALUES
  ('AU', 'Australia',   'Australian-based staff',    10),
  ('PH', 'Philippines', 'Philippines-based staff',   20)
ON CONFLICT (code) DO NOTHING;

-- 3. staff_provisioning_rules: keyed by (role_code, location_code)
CREATE TABLE IF NOT EXISTS public.staff_provisioning_rules (
  id              bigserial PRIMARY KEY,
  role_code       text NOT NULL REFERENCES public.dd_staff_role(code) ON UPDATE CASCADE,
  location_code   text NOT NULL REFERENCES public.dd_staff_location(code) ON UPDATE CASCADE,
  m365_groups     text[] NOT NULL DEFAULT ARRAY[]::text[],
  licenses        text[] NOT NULL DEFAULT ARRAY[]::text[],
  software        text[] NOT NULL DEFAULT ARRAY[]::text[],
  calendars       text[] NOT NULL DEFAULT ARRAY[]::text[],
  notes           text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_code, location_code)
);

CREATE INDEX IF NOT EXISTS idx_staff_provisioning_rules_lookup
  ON public.staff_provisioning_rules(role_code, location_code) WHERE is_active;

ALTER TABLE public.staff_provisioning_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_provisioning_rules read vivacity"
  ON public.staff_provisioning_rules FOR SELECT TO authenticated
  USING (public.is_vivacity());
CREATE POLICY "staff_provisioning_rules manage vivacity"
  ON public.staff_provisioning_rules FOR ALL TO authenticated
  USING (public.is_vivacity()) WITH CHECK (public.is_vivacity());

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_spr_updated_at ON public.staff_provisioning_rules;
CREATE TRIGGER trg_spr_updated_at
  BEFORE UPDATE ON public.staff_provisioning_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_dd_staff_role_updated_at ON public.dd_staff_role;
CREATE TRIGGER trg_dd_staff_role_updated_at
  BEFORE UPDATE ON public.dd_staff_role
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_dd_staff_location_updated_at ON public.dd_staff_location;
CREATE TRIGGER trg_dd_staff_location_updated_at
  BEFORE UPDATE ON public.dd_staff_location
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Seed rules from XLSM (Vivacity Master Document)
-- Groups taken from Details!"Groups" block.
-- Licenses use Microsoft SKU part numbers ("BUSINESS_BASIC", "ENTERPRISEPACK"=E3).
-- Software & calendars seeded from the same workbook.
INSERT INTO public.staff_provisioning_rules
  (role_code, location_code, m365_groups, licenses, software, calendars, notes)
VALUES
  ('consultant', 'AU',
   ARRAY['Client Success Team','Vivacity Master','Vivacity Team - AU','All Company','Master Documents','Resources Vault','Information Technology Team'],
   ARRAY['ENTERPRISEPACK'],
   ARRAY['Outlook','ClickUp','Teams','Xero','Unicorn','Infusionsoft','Vivacity.Training','Canva','Vimeo','Calendly'],
   ARRAY['Daily Huddle','Afternoon Huddle','Mastermind','PD Workshops','Monthly Compliance','Masterclass'],
   'Seeded from Vivacity New User Setup workbook (AU)'
  ),
  ('consultant', 'PH',
   ARRAY['Client Success Team','Vivacity Master','Vivacity Team - PH','All Company','Master Documents','Resources Vault'],
   ARRAY['O365_BUSINESS_ESSENTIALS'],
   ARRAY['Outlook','ClickUp','Teams','Unicorn','Vivacity.Training','HubStaff'],
   ARRAY['Daily Huddle','Afternoon Huddle','Mastermind','PD Workshops'],
   'Seeded from Vivacity New User Setup workbook (PH)'
  ),
  ('senior_consultant', 'AU',
   ARRAY['Client Success Team','Vivacity Master','Vivacity Team - AU','All Company','Master Documents','Superhero Members','Resources Vault','Information Technology Team'],
   ARRAY['ENTERPRISEPACK'],
   ARRAY['Outlook','ClickUp','Teams','Xero','Unicorn','Infusionsoft','Vivacity.Training','Canva','Vimeo','Calendly','Website'],
   ARRAY['Daily Huddle','Afternoon Huddle','Mastermind','PD Workshops','Monthly Compliance','Masterclass'],
   'Seeded — senior tier with Superhero Members + Website access'
  ),
  ('admin_assistant', 'PH',
   ARRAY['Client Experience Team','Vivacity Master','Vivacity Team - PH','All Company','Master Documents','Support'],
   ARRAY['O365_BUSINESS_ESSENTIALS'],
   ARRAY['Outlook','ClickUp','Teams','Xero','Canva','HubStaff','Vivacity.Training'],
   ARRAY['Daily Huddle','Afternoon Huddle'],
   'Seeded — Ops/Admin (PH)'
  ),
  ('client_success', 'AU',
   ARRAY['Client Success Team','Vivacity Master','Vivacity Team - AU','All Company','Clients','Master Documents'],
   ARRAY['ENTERPRISEPACK'],
   ARRAY['Outlook','ClickUp','Teams','Unicorn','Infusionsoft','Vivacity.Training'],
   ARRAY['Daily Huddle','Afternoon Huddle','PD Workshops'],
   'Seeded — Client Success (AU)'
  ),
  ('client_experience', 'AU',
   ARRAY['Client Experience Team','Vivacity Master','Vivacity Team - AU','All Company','Clients','Support'],
   ARRAY['ENTERPRISEPACK'],
   ARRAY['Outlook','ClickUp','Teams','Unicorn','Vivacity.Training','Canva'],
   ARRAY['Daily Huddle','Afternoon Huddle','PD Workshops'],
   'Seeded — Client Experience (AU)'
  ),
  ('business_growth', 'AU',
   ARRAY['Business Growth Team','BGT-Only','Vivacity Master','Vivacity Team - AU','All Company','Master Documents'],
   ARRAY['ENTERPRISEPACK'],
   ARRAY['Outlook','ClickUp','Teams','Infusionsoft','Canva','Vimeo','Website'],
   ARRAY['Daily Huddle','Mastermind','Monthly Compliance'],
   'Seeded — Business Growth (AU)'
  ),
  ('software_developer', 'PH',
   ARRAY['Information Technology Team','Vivacity Master','Vivacity Team - PH','All Company'],
   ARRAY['O365_BUSINESS_ESSENTIALS'],
   ARRAY['Outlook','ClickUp','Teams','Unicorn','HubStaff'],
   ARRAY['Daily Huddle'],
   'Seeded — Dev (PH)'
  ),
  ('leadership', 'AU',
   ARRAY['Vivacity Master','Vivacity Team - AU','All Company','Master Documents','Superhero Members','Information Technology Team','BGT-Only','Client Success Team','Client Experience Team'],
   ARRAY['ENTERPRISEPACK'],
   ARRAY['Outlook','ClickUp','Teams','Xero','Unicorn','Infusionsoft','Vivacity.Training','Canva','Vimeo','Calendly','Website'],
   ARRAY['Daily Huddle','Afternoon Huddle','Mastermind','PD Workshops','Monthly Compliance','Masterclass'],
   'Seeded — Leadership (AU)'
  )
ON CONFLICT (role_code, location_code) DO NOTHING;

-- 5. Link instances → derived staff onboarding run via package_instance_id is unsuitable;
--    add a lightweight staff_provisioning_runs table to group instances.
CREATE TABLE IF NOT EXISTS public.staff_provisioning_runs (
  id                bigserial PRIMARY KEY,
  target_user_id    uuid REFERENCES public.users(user_uuid) ON DELETE SET NULL,
  requested_by      uuid REFERENCES public.users(user_uuid) ON DELETE SET NULL,
  team_leader_id    uuid REFERENCES public.users(user_uuid) ON DELETE SET NULL,
  first_name        text NOT NULL,
  last_name         text NOT NULL,
  preferred_name    text,
  personal_email    text,
  phone             text,
  role_code         text NOT NULL REFERENCES public.dd_staff_role(code),
  location_code     text NOT NULL REFERENCES public.dd_staff_location(code),
  job_title         text,
  start_date        date,
  upn               text,
  display_name      text,
  mail_nickname     text,
  ms_user_id        text,
  status            text NOT NULL DEFAULT 'draft', -- draft | provisioning | provisioned | failed
  graph_transcript  jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spr_runs_status ON public.staff_provisioning_runs(status);
CREATE INDEX IF NOT EXISTS idx_spr_runs_target ON public.staff_provisioning_runs(target_user_id);

ALTER TABLE public.staff_provisioning_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spr_runs read vivacity"
  ON public.staff_provisioning_runs FOR SELECT TO authenticated USING (public.is_vivacity());
CREATE POLICY "spr_runs manage vivacity"
  ON public.staff_provisioning_runs FOR ALL TO authenticated
  USING (public.is_vivacity()) WITH CHECK (public.is_vivacity());

DROP TRIGGER IF EXISTS trg_spr_runs_updated_at ON public.staff_provisioning_runs;
CREATE TRIGGER trg_spr_runs_updated_at
  BEFORE UPDATE ON public.staff_provisioning_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Link checklist instances to a provisioning run (optional column)
ALTER TABLE public.lifecycle_checklist_instances
  ADD COLUMN IF NOT EXISTS provisioning_run_id bigint
  REFERENCES public.staff_provisioning_runs(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_lci_run ON public.lifecycle_checklist_instances(provisioning_run_id);
