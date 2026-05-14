
-- ============================================================
-- PART 2: tenant_role legacy cleanup
-- Part 1 (edge function patches) deployed and verified clean.
-- ============================================================

-- ------------------------------------------------------------
-- 2.1 dd_tenant_role lookup
-- ------------------------------------------------------------
CREATE TABLE public.dd_tenant_role (
  id          serial PRIMARY KEY,
  value       text NOT NULL UNIQUE,
  label       text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dd_tenant_role ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dd_tenant_role_select"
  ON public.dd_tenant_role FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "dd_tenant_role_admin_all"
  ON public.dd_tenant_role FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

INSERT INTO public.dd_tenant_role (value, label, sort_order) VALUES
  ('Admin',        'Admin',        10),
  ('General User', 'General User', 20);

-- ------------------------------------------------------------
-- 2.2 Rewrite 7 RLS policies (drop dead users.tenant_role branch)
-- ------------------------------------------------------------

-- accountability_charts
DROP POLICY IF EXISTS "accountability_charts_admin_all" ON public.accountability_charts;
CREATE POLICY "accountability_charts_admin_all"
  ON public.accountability_charts FOR ALL TO authenticated
  USING (
    public.is_vivacity_team_safe((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = accountability_charts.tenant_id
        AND tm.role = 'Admin'
        AND tm.status = 'active'
    )
  );

-- accountability_chart_versions
DROP POLICY IF EXISTS "accountability_chart_versions_admin_all" ON public.accountability_chart_versions;
CREATE POLICY "accountability_chart_versions_admin_all"
  ON public.accountability_chart_versions FOR ALL TO authenticated
  USING (
    public.is_vivacity_team_safe((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = accountability_chart_versions.tenant_id
        AND tm.role = 'Admin'
        AND tm.status = 'active'
    )
  );

-- accountability_functions
DROP POLICY IF EXISTS "accountability_functions_admin_all" ON public.accountability_functions;
CREATE POLICY "accountability_functions_admin_all"
  ON public.accountability_functions FOR ALL TO authenticated
  USING (
    public.is_vivacity_team_safe((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = accountability_functions.tenant_id
        AND tm.role = 'Admin'
        AND tm.status = 'active'
    )
  );

-- accountability_seats
DROP POLICY IF EXISTS "accountability_seats_admin_all" ON public.accountability_seats;
CREATE POLICY "accountability_seats_admin_all"
  ON public.accountability_seats FOR ALL TO authenticated
  USING (
    public.is_vivacity_team_safe((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = accountability_seats.tenant_id
        AND tm.role = 'Admin'
        AND tm.status = 'active'
    )
  );

-- accountability_seat_roles
DROP POLICY IF EXISTS "accountability_seat_roles_admin_all" ON public.accountability_seat_roles;
CREATE POLICY "accountability_seat_roles_admin_all"
  ON public.accountability_seat_roles FOR ALL TO authenticated
  USING (
    public.is_vivacity_team_safe((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = accountability_seat_roles.tenant_id
        AND tm.role = 'Admin'
        AND tm.status = 'active'
    )
  );

-- accountability_seat_assignments
DROP POLICY IF EXISTS "accountability_seat_assignments_admin_all" ON public.accountability_seat_assignments;
CREATE POLICY "accountability_seat_assignments_admin_all"
  ON public.accountability_seat_assignments FOR ALL TO authenticated
  USING (
    public.is_vivacity_team_safe((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.tenant_id = accountability_seat_assignments.tenant_id
        AND tm.role = 'Admin'
        AND tm.status = 'active'
    )
  );

-- eos_alerts (no tenant_id join in original — preserve shape)
DROP POLICY IF EXISTS "eos_alerts_admin_update" ON public.eos_alerts;
CREATE POLICY "eos_alerts_admin_update"
  ON public.eos_alerts FOR UPDATE TO authenticated
  USING (
    public.is_vivacity_team_safe((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = (SELECT auth.uid())
        AND tm.role = 'Admin'
        AND tm.status = 'active'
    )
  );

-- ------------------------------------------------------------
-- 2.3 doc_files casing fix ('admin' -> 'Admin')
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "tenant_admin_select_doc_files" ON public.doc_files;
CREATE POLICY "tenant_admin_select_doc_files"
  ON public.doc_files FOR SELECT TO authenticated
  USING (
    (NOT public.is_vivacity_team_safe((SELECT auth.uid())))
    AND public.has_tenant_access_safe(tenant_id, (SELECT auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = doc_files.tenant_id
        AND tm.user_id = (SELECT auth.uid())
        AND tm.role = 'Admin'
        AND tm.status = 'active'
    )
  );

-- ------------------------------------------------------------
-- 2.4 Drop dead 2-arg is_tenant_admin (1-arg version preserved)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.is_tenant_admin(uuid, bigint);

-- ------------------------------------------------------------
-- 2.5 Archive + drop ghost users.tenant_role column
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS archive.users_tenant_role_legacy AS
SELECT user_uuid, tenant_role, now() AS archived_at
FROM public.users;

ALTER TABLE public.users DROP COLUMN IF EXISTS tenant_role;

-- ------------------------------------------------------------
-- 2.6 Archive + drop orphan tenant_role enum
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'archive' AND t.typname = 'tenant_role'
  ) THEN
    CREATE TYPE archive.tenant_role AS ENUM ('ADMIN', 'GENERAL_USER');
  END IF;
END $$;

DROP TYPE IF EXISTS public.tenant_role;

-- ============================================================
-- ROLLBACK (captured original DDL — manual restore if needed)
-- ============================================================
/*
-- Reverse 2.1
DROP TABLE IF EXISTS public.dd_tenant_role;

-- Reverse 2.6
CREATE TYPE public.tenant_role AS ENUM ('ADMIN', 'GENERAL_USER');
DROP TYPE IF EXISTS archive.tenant_role;

-- Reverse 2.5
ALTER TABLE public.users ADD COLUMN tenant_role text DEFAULT 'user';
UPDATE public.users u
   SET tenant_role = a.tenant_role
  FROM archive.users_tenant_role_legacy a
 WHERE a.user_uuid = u.user_uuid;
DROP TABLE IF EXISTS archive.users_tenant_role_legacy;

-- Reverse 2.4
CREATE OR REPLACE FUNCTION public.is_tenant_admin(_user_id uuid, _tenant_id bigint)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = _user_id
      AND (unicorn_role = 'Super Admin'
           OR (tenant_id = _tenant_id AND tenant_role = 'admin'))
  )
$fn$;

-- Reverse 2.3 (doc_files lowercase 'admin')
DROP POLICY IF EXISTS "tenant_admin_select_doc_files" ON public.doc_files;
CREATE POLICY "tenant_admin_select_doc_files" ON public.doc_files FOR SELECT TO authenticated
USING ((NOT is_vivacity_team_safe((SELECT auth.uid())))
       AND has_tenant_access_safe(tenant_id, (SELECT auth.uid()))
       AND EXISTS (SELECT 1 FROM tenant_members tm
                   WHERE tm.tenant_id = doc_files.tenant_id
                     AND tm.user_id = (SELECT auth.uid())
                     AND tm.role = 'admin' AND tm.status = 'active'));

-- Reverse 2.2 (original accountability + eos_alerts policies; pattern below)
-- accountability_charts_admin_all (repeat for each table with matching tenant_id ref):
-- CREATE POLICY "accountability_charts_admin_all" ON public.accountability_charts FOR ALL TO authenticated
-- USING (EXISTS (SELECT 1 FROM users WHERE users.user_uuid = (SELECT auth.uid())
--   AND (users.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role,'Team Leader'::unicorn_role])
--        OR (users.tenant_id = accountability_charts.tenant_id AND users.tenant_role = 'Admin'))));
-- (Same pattern for chart_versions, functions, seats, seat_roles, seat_assignments.)
-- eos_alerts_admin_update (no tenant_id join):
-- CREATE POLICY "eos_alerts_admin_update" ON public.eos_alerts FOR UPDATE TO authenticated
-- USING (EXISTS (SELECT 1 FROM users WHERE users.user_uuid = (SELECT auth.uid())
--   AND (users.unicorn_role = ANY (ARRAY['Super Admin'::unicorn_role,'Team Leader'::unicorn_role])
--        OR users.tenant_role = 'Admin')));
-- NOTE: Reverse 2.2 cannot run until users.tenant_role column is restored (Reverse 2.5 first).
*/
