
-- Phase 6b: Externalise lifecycle and access status to code tables

-- 1. Create dd_lifecycle_status
CREATE TABLE public.dd_lifecycle_status (
  id serial PRIMARY KEY,
  label text NOT NULL,
  value text NOT NULL UNIQUE,
  seq integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false
);

-- 2. Create dd_access_status
CREATE TABLE public.dd_access_status (
  id serial PRIMARY KEY,
  label text NOT NULL,
  value text NOT NULL UNIQUE,
  seq integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false
);

-- 3. Seed dd_lifecycle_status
INSERT INTO public.dd_lifecycle_status (label, value, seq, is_default) VALUES
  ('Active',    'active',    1, true),
  ('Suspended', 'suspended', 2, false),
  ('Closed',    'closed',    3, false),
  ('Archived',  'archived',  4, false);

-- 4. Seed dd_access_status
INSERT INTO public.dd_access_status (label, value, seq, is_default) VALUES
  ('Enabled',  'enabled',  1, true),
  ('Disabled', 'disabled', 2, false);

-- 5. Enable RLS
ALTER TABLE public.dd_lifecycle_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dd_access_status ENABLE ROW LEVEL SECURITY;

-- 6. RLS policies — SELECT for all authenticated
CREATE POLICY "Authenticated users can read dd_lifecycle_status"
  ON public.dd_lifecycle_status FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can read dd_access_status"
  ON public.dd_access_status FOR SELECT
  TO authenticated USING (true);

-- 7. RLS policies — Full CRUD for Super Admins only
CREATE POLICY "Super Admins can manage dd_lifecycle_status"
  ON public.dd_lifecycle_status FOR ALL
  USING (public.is_super_admin_safe(auth.uid()))
  WITH CHECK (public.is_super_admin_safe(auth.uid()));

CREATE POLICY "Super Admins can manage dd_access_status"
  ON public.dd_access_status FOR ALL
  USING (public.is_super_admin_safe(auth.uid()))
  WITH CHECK (public.is_super_admin_safe(auth.uid()));

-- 8. Drop existing CHECK constraints from tenants
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS chk_lifecycle_status;
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS chk_access_status;
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_lifecycle_status_check;
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_access_status_check;

-- 9. Add FK constraints referencing code tables
ALTER TABLE public.tenants
  ADD CONSTRAINT fk_tenant_lifecycle_status
  FOREIGN KEY (lifecycle_status) REFERENCES public.dd_lifecycle_status(value);

ALTER TABLE public.tenants
  ADD CONSTRAINT fk_tenant_access_status
  FOREIGN KEY (access_status) REFERENCES public.dd_access_status(value);
