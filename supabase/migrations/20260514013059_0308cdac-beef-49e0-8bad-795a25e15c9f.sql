DROP POLICY IF EXISTS client_audit_log_superadmin_insert ON public.client_audit_log;
CREATE POLICY client_audit_log_superadmin_insert
  ON public.client_audit_log
  AS PERMISSIVE FOR INSERT
  TO public
  WITH CHECK (public.is_vivacity_team_safe((SELECT auth.uid())));

DROP POLICY IF EXISTS client_audit_log_superadmin_select ON public.client_audit_log;
CREATE POLICY client_audit_log_superadmin_select
  ON public.client_audit_log
  AS PERMISSIVE FOR SELECT
  TO public
  USING (public.is_vivacity_team_safe((SELECT auth.uid())));

DO $$
DECLARE v_ins text; v_sel text;
BEGIN
  SELECT pg_get_expr(polwithcheck, polrelid) INTO v_ins
    FROM pg_policy WHERE polrelid='public.client_audit_log'::regclass
      AND polname='client_audit_log_superadmin_insert';
  SELECT pg_get_expr(polqual, polrelid) INTO v_sel
    FROM pg_policy WHERE polrelid='public.client_audit_log'::regclass
      AND polname='client_audit_log_superadmin_select';
  ASSERT v_ins ILIKE '%is_vivacity_team_safe%', 'INSERT policy missing is_vivacity_team_safe';
  ASSERT v_sel ILIKE '%is_vivacity_team_safe%', 'SELECT policy missing is_vivacity_team_safe';
  ASSERT (SELECT count(*) FROM pg_policy WHERE polrelid='public.client_audit_log'::regclass) = 2,
    'Unexpected policy count on client_audit_log';
END $$;