-- Fix Stage Template RLS - Restrict to SuperAdmin Only
-- Drop existing overly permissive policies

-- stage_team_tasks
DROP POLICY IF EXISTS "Authenticated users can view stage_team_tasks" ON stage_team_tasks;
DROP POLICY IF EXISTS "Authenticated users can insert stage_team_tasks" ON stage_team_tasks;
DROP POLICY IF EXISTS "Authenticated users can update stage_team_tasks" ON stage_team_tasks;
DROP POLICY IF EXISTS "Authenticated users can delete stage_team_tasks" ON stage_team_tasks;

-- stage_client_tasks
DROP POLICY IF EXISTS "Authenticated users can view stage_client_tasks" ON stage_client_tasks;
DROP POLICY IF EXISTS "Authenticated users can insert stage_client_tasks" ON stage_client_tasks;
DROP POLICY IF EXISTS "Authenticated users can update stage_client_tasks" ON stage_client_tasks;
DROP POLICY IF EXISTS "Authenticated users can delete stage_client_tasks" ON stage_client_tasks;

-- stage_emails
DROP POLICY IF EXISTS "Authenticated users can view stage_emails" ON stage_emails;
DROP POLICY IF EXISTS "Authenticated users can insert stage_emails" ON stage_emails;
DROP POLICY IF EXISTS "Authenticated users can update stage_emails" ON stage_emails;
DROP POLICY IF EXISTS "Authenticated users can delete stage_emails" ON stage_emails;

-- stage_documents
DROP POLICY IF EXISTS "Authenticated users can view stage_documents" ON stage_documents;
DROP POLICY IF EXISTS "Authenticated users can insert stage_documents" ON stage_documents;
DROP POLICY IF EXISTS "Authenticated users can update stage_documents" ON stage_documents;
DROP POLICY IF EXISTS "Authenticated users can delete stage_documents" ON stage_documents;

-- Create helper function if not exists
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = auth.uid()
    AND unicorn_role = 'Super Admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create new SuperAdmin-only policies for stage_team_tasks
-- Allow all authenticated users to VIEW (needed for package workflow display)
CREATE POLICY "All authenticated can view stage_team_tasks"
  ON stage_team_tasks FOR SELECT
  TO authenticated
  USING (true);

-- Only SuperAdmin can modify
CREATE POLICY "SuperAdmin can insert stage_team_tasks"
  ON stage_team_tasks FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY "SuperAdmin can update stage_team_tasks"
  ON stage_team_tasks FOR UPDATE
  TO authenticated
  USING (is_super_admin());

CREATE POLICY "SuperAdmin can delete stage_team_tasks"
  ON stage_team_tasks FOR DELETE
  TO authenticated
  USING (is_super_admin());

-- Create new SuperAdmin-only policies for stage_client_tasks
CREATE POLICY "All authenticated can view stage_client_tasks"
  ON stage_client_tasks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "SuperAdmin can insert stage_client_tasks"
  ON stage_client_tasks FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY "SuperAdmin can update stage_client_tasks"
  ON stage_client_tasks FOR UPDATE
  TO authenticated
  USING (is_super_admin());

CREATE POLICY "SuperAdmin can delete stage_client_tasks"
  ON stage_client_tasks FOR DELETE
  TO authenticated
  USING (is_super_admin());

-- Create new SuperAdmin-only policies for stage_emails
CREATE POLICY "All authenticated can view stage_emails"
  ON stage_emails FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "SuperAdmin can insert stage_emails"
  ON stage_emails FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY "SuperAdmin can update stage_emails"
  ON stage_emails FOR UPDATE
  TO authenticated
  USING (is_super_admin());

CREATE POLICY "SuperAdmin can delete stage_emails"
  ON stage_emails FOR DELETE
  TO authenticated
  USING (is_super_admin());

-- Create new SuperAdmin-only policies for stage_documents
CREATE POLICY "All authenticated can view stage_documents"
  ON stage_documents FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "SuperAdmin can insert stage_documents"
  ON stage_documents FOR INSERT
  TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY "SuperAdmin can update stage_documents"
  ON stage_documents FOR UPDATE
  TO authenticated
  USING (is_super_admin());

CREATE POLICY "SuperAdmin can delete stage_documents"
  ON stage_documents FOR DELETE
  TO authenticated
  USING (is_super_admin());