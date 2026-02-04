-- =====================================================
-- Fix overly permissive RLS policies
-- =====================================================

-- 1. document_versions - restrict to staff/superadmin
DROP POLICY IF EXISTS "Authenticated users can delete document versions" ON public.document_versions;
DROP POLICY IF EXISTS "Authenticated users can insert document versions" ON public.document_versions;
DROP POLICY IF EXISTS "Authenticated users can update document versions" ON public.document_versions;

CREATE POLICY "Staff can delete document versions"
ON public.document_versions FOR DELETE
USING (is_staff() OR is_super_admin());

CREATE POLICY "Staff can insert document versions"
ON public.document_versions FOR INSERT
WITH CHECK (is_staff() OR is_super_admin());

CREATE POLICY "Staff can update document versions"
ON public.document_versions FOR UPDATE
USING (is_staff() OR is_super_admin());

-- 2. package_stages - restrict to staff/superadmin
DROP POLICY IF EXISTS "package_stages_delete_authenticated" ON public.package_stages;
DROP POLICY IF EXISTS "package_stages_insert_authenticated" ON public.package_stages;
DROP POLICY IF EXISTS "package_stages_update_authenticated" ON public.package_stages;

CREATE POLICY "Staff can delete package stages"
ON public.package_stages FOR DELETE
USING (is_staff() OR is_super_admin());

CREATE POLICY "Staff can insert package stages"
ON public.package_stages FOR INSERT
WITH CHECK (is_staff() OR is_super_admin());

CREATE POLICY "Staff can update package stages"
ON public.package_stages FOR UPDATE
USING (is_staff() OR is_super_admin());

-- 3. tenant_document_releases - restrict to staff/superadmin
DROP POLICY IF EXISTS "Authenticated users can delete tenant document releases" ON public.tenant_document_releases;
DROP POLICY IF EXISTS "Authenticated users can insert tenant document releases" ON public.tenant_document_releases;
DROP POLICY IF EXISTS "Authenticated users can update tenant document releases" ON public.tenant_document_releases;

CREATE POLICY "Admins can delete tenant document releases"
ON public.tenant_document_releases FOR DELETE
USING (is_super_admin() OR is_staff());

CREATE POLICY "Admins can insert tenant document releases"
ON public.tenant_document_releases FOR INSERT
WITH CHECK (is_super_admin() OR is_staff());

CREATE POLICY "Admins can update tenant document releases"
ON public.tenant_document_releases FOR UPDATE
USING (is_super_admin() OR is_staff());

-- 4. stage_versions - restrict to staff/superadmin
DROP POLICY IF EXISTS "Authenticated users can insert stage versions" ON public.stage_versions;
DROP POLICY IF EXISTS "Authenticated users can update stage versions" ON public.stage_versions;

CREATE POLICY "Staff can insert stage versions"
ON public.stage_versions FOR INSERT
WITH CHECK (is_staff() OR is_super_admin());

CREATE POLICY "Staff can update stage versions"
ON public.stage_versions FOR UPDATE
USING (is_staff() OR is_super_admin());

-- 5. packages - restrict to staff/superadmin
DROP POLICY IF EXISTS "Authenticated users can add packages" ON public.packages;

CREATE POLICY "Staff can add packages"
ON public.packages FOR INSERT
WITH CHECK (is_staff() OR is_super_admin());

-- 6. profiles - restrict to own profile (use user_id column)
DROP POLICY IF EXISTS "Edge function can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Edge function can update profiles" ON public.profiles;

CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = user_id OR is_super_admin());

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = user_id OR is_super_admin())
WITH CHECK (auth.uid() = user_id OR is_super_admin());

-- 7. standards_reference - superadmin only
DROP POLICY IF EXISTS "SuperAdmins can manage standards reference" ON public.standards_reference;

CREATE POLICY "SuperAdmins can manage standards reference"
ON public.standards_reference FOR ALL
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- 8. audit_avatars - user can insert own
DROP POLICY IF EXISTS "Edge or user can insert avatar logs" ON public.audit_avatars;
CREATE POLICY "Users can insert own avatar logs"
ON public.audit_avatars FOR INSERT
WITH CHECK (auth.uid() = user_id OR is_super_admin());

-- 9. document_ai_audit - staff only
DROP POLICY IF EXISTS "Users can insert document AI audit logs" ON public.document_ai_audit;
CREATE POLICY "Staff can insert document AI audit logs"
ON public.document_ai_audit FOR INSERT
WITH CHECK (is_staff() OR is_super_admin());