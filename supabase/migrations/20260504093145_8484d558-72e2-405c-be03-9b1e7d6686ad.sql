
-- staff_tasks: replace legacy is_superadmin() policies
DROP POLICY IF EXISTS "staff_tasks_superadmin_insert" ON public.staff_tasks;
DROP POLICY IF EXISTS "staff_tasks_superadmin_update" ON public.staff_tasks;
DROP POLICY IF EXISTS "staff_tasks_superadmin_delete" ON public.staff_tasks;

CREATE POLICY "staff_tasks_staff_write_insert"
  ON public.staff_tasks FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff() OR public.is_super_admin());
CREATE POLICY "staff_tasks_staff_write_update"
  ON public.staff_tasks FOR UPDATE
  TO authenticated
  USING (public.is_staff() OR public.is_super_admin())
  WITH CHECK (public.is_staff() OR public.is_super_admin());
CREATE POLICY "staff_tasks_staff_write_delete"
  ON public.staff_tasks FOR DELETE
  TO authenticated
  USING (public.is_staff() OR public.is_super_admin());

-- client_tasks: had no write policies at all
DROP POLICY IF EXISTS "client_tasks_staff_write_insert" ON public.client_tasks;
DROP POLICY IF EXISTS "client_tasks_staff_write_update" ON public.client_tasks;
DROP POLICY IF EXISTS "client_tasks_staff_write_delete" ON public.client_tasks;

CREATE POLICY "client_tasks_staff_write_insert"
  ON public.client_tasks FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff() OR public.is_super_admin());
CREATE POLICY "client_tasks_staff_write_update"
  ON public.client_tasks FOR UPDATE
  TO authenticated
  USING (public.is_staff() OR public.is_super_admin())
  WITH CHECK (public.is_staff() OR public.is_super_admin());
CREATE POLICY "client_tasks_staff_write_delete"
  ON public.client_tasks FOR DELETE
  TO authenticated
  USING (public.is_staff() OR public.is_super_admin());

-- emails: replace legacy is_super_admin() ALL policy + add SELECT for staff
DROP POLICY IF EXISTS "emails_superadmin_all" ON public.emails;
DROP POLICY IF EXISTS "emails_authenticated_select" ON public.emails;
DROP POLICY IF EXISTS "emails_staff_all" ON public.emails;

CREATE POLICY "emails_authenticated_select"
  ON public.emails FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "emails_staff_all"
  ON public.emails FOR ALL
  TO authenticated
  USING (public.is_staff() OR public.is_super_admin())
  WITH CHECK (public.is_staff() OR public.is_super_admin());
