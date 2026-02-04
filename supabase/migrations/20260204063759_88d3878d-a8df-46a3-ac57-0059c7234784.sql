-- =====================================================
-- Add RLS policies to tables with RLS enabled but no policies
-- =====================================================

-- 1. client_tasks_u2 - Client task instances (staff access)
CREATE POLICY "Staff and SuperAdmins can view client tasks"
ON public.client_tasks_u2 FOR SELECT
USING (is_staff() OR is_super_admin());

CREATE POLICY "Staff and SuperAdmins can manage client tasks"
ON public.client_tasks_u2 FOR ALL
USING (is_staff() OR is_super_admin())
WITH CHECK (is_staff() OR is_super_admin());

-- 2. emails_duplicate - Backup/duplicate email templates (staff-only)
CREATE POLICY "Staff can view email duplicates"
ON public.emails_duplicate FOR SELECT
USING (is_staff() OR is_super_admin());

CREATE POLICY "SuperAdmins can manage email duplicates"
ON public.emails_duplicate FOR ALL
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- 3. process_tags - Tenant-scoped tags (uses UUID tenant_id)
-- Create helper function for UUID tenant membership check (no status column in tenant_users)
CREATE OR REPLACE FUNCTION public.user_in_tenant_uuid(p_tenant_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenants t
    JOIN tenant_users tu ON tu.tenant_id = t.id
    WHERE t.id_uuid = p_tenant_uuid
      AND tu.user_id = auth.uid()
  )
$$;

CREATE POLICY "Tenant members can view process tags"
ON public.process_tags FOR SELECT
USING (user_in_tenant_uuid(tenant_id) OR is_staff() OR is_super_admin());

CREATE POLICY "Staff can manage process tags"
ON public.process_tags FOR ALL
USING (is_staff() OR is_super_admin())
WITH CHECK (is_staff() OR is_super_admin());

-- 4. process_tag_links - Tenant-scoped tag links
CREATE POLICY "Tenant members can view process tag links"
ON public.process_tag_links FOR SELECT
USING (user_in_tenant_uuid(tenant_id) OR is_staff() OR is_super_admin());

CREATE POLICY "Staff can manage process tag links"
ON public.process_tag_links FOR ALL
USING (is_staff() OR is_super_admin())
WITH CHECK (is_staff() OR is_super_admin());

-- 5. training_folders - Training content folders (authenticated read, staff manage)
CREATE POLICY "Authenticated users can view training folders"
ON public.training_folders FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Staff can manage training folders"
ON public.training_folders FOR ALL
USING (is_staff() OR is_super_admin())
WITH CHECK (is_staff() OR is_super_admin());

-- 6. training_videos - Training videos (authenticated read, staff manage)
CREATE POLICY "Authenticated users can view training videos"
ON public.training_videos FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Staff can manage training videos"
ON public.training_videos FOR ALL
USING (is_staff() OR is_super_admin())
WITH CHECK (is_staff() OR is_super_admin());