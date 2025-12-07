-- Enable RLS on client_tasks table
ALTER TABLE public.client_tasks ENABLE ROW LEVEL SECURITY;

-- Allow super admins full access
CREATE POLICY "client_tasks_admin_all" ON public.client_tasks
  FOR ALL
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Allow all authenticated users to view client tasks
CREATE POLICY "client_tasks_select" ON public.client_tasks
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Allow authenticated users to insert client tasks
CREATE POLICY "client_tasks_insert" ON public.client_tasks
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Allow authenticated users to update client tasks
CREATE POLICY "client_tasks_update" ON public.client_tasks
  FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Allow authenticated users to delete client tasks
CREATE POLICY "client_tasks_delete" ON public.client_tasks
  FOR DELETE
  USING (auth.uid() IS NOT NULL);