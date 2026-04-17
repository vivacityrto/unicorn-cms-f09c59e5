-- Lookup table for external user-setup links shown after a new starter is saved
CREATE TABLE public.dd_usersetup_links (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other', -- 'm365' | 'other'
  description TEXT,
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dd_usersetup_links ENABLE ROW LEVEL SECURITY;

-- Vivacity staff (any role) can read; only SuperAdmin can mutate
CREATE POLICY "usersetup_links_read_staff"
ON public.dd_usersetup_links
FOR SELECT
TO authenticated
USING (public.is_vivacity());

CREATE POLICY "usersetup_links_write_superadmin"
ON public.dd_usersetup_links
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
      AND (u.global_role = 'SuperAdmin' OR u.unicorn_role = 'Super Admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
      AND (u.global_role = 'SuperAdmin' OR u.unicorn_role = 'Super Admin')
  )
);

CREATE TRIGGER trg_dd_usersetup_links_updated_at
BEFORE UPDATE ON public.dd_usersetup_links
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed initial links
INSERT INTO public.dd_usersetup_links (code, label, url, category, description, sort_order) VALUES
  ('m365_users', 'M365 Users', 'https://admin.microsoft.com/#/users', 'm365', 'Microsoft 365 Admin Center — manage users, licenses, groups', 10),
  ('m365_teams', 'M365 Teams', 'https://admin.teams.microsoft.com/dashboard', 'm365', 'Teams Admin Center — manage Teams membership & policies', 20),
  ('hubstaff',   'HubStaff',   'https://account.hubstaff.com/login',     'other', 'Time tracking — invite the user', 30),
  ('keap',       'Keap (Infusionsoft)', 'https://app.infusionsoft.com/', 'other', 'CRM — add user contact', 40),
  ('lovable',    'Lovable',    'https://lovable.dev/',                   'other', 'Lovable workspace access', 50);