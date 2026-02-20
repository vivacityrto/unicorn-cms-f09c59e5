
-- Allow Vivacity staff to read ClickUp tasks (base table)
CREATE POLICY "vivacity_staff_select_clickup_tasks"
  ON public.clickup_tasks
  FOR SELECT
  TO authenticated
  USING (public.is_vivacity_staff(auth.uid()));

-- Allow Vivacity staff to read ClickUp tasks DB records (base table)
CREATE POLICY "vivacity_staff_select_clickup_tasksdb"
  ON public.clickup_tasksdb
  FOR SELECT
  TO authenticated
  USING (public.is_vivacity_staff(auth.uid()));

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
