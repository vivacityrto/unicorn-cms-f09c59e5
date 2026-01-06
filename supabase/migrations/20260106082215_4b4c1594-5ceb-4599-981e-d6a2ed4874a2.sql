-- Drop existing permissive policies on package_stage_emails
DROP POLICY IF EXISTS "Authenticated users can view package stage emails" ON public.package_stage_emails;
DROP POLICY IF EXISTS "Authenticated users can insert package stage emails" ON public.package_stage_emails;
DROP POLICY IF EXISTS "Authenticated users can update package stage emails" ON public.package_stage_emails;
DROP POLICY IF EXISTS "Authenticated users can delete package stage emails" ON public.package_stage_emails;

-- Drop existing permissive policies on package_builder_audit_log
DROP POLICY IF EXISTS "Authenticated users can view package builder audit log" ON public.package_builder_audit_log;
DROP POLICY IF EXISTS "Authenticated users can insert package builder audit log" ON public.package_builder_audit_log;

-- Create SuperAdmin-only policies for package_stage_emails
CREATE POLICY "SuperAdmin can view package stage emails"
ON public.package_stage_emails
FOR SELECT
TO authenticated
USING (public.is_superadmin());

CREATE POLICY "SuperAdmin can insert package stage emails"
ON public.package_stage_emails
FOR INSERT
TO authenticated
WITH CHECK (public.is_superadmin());

CREATE POLICY "SuperAdmin can update package stage emails"
ON public.package_stage_emails
FOR UPDATE
TO authenticated
USING (public.is_superadmin());

CREATE POLICY "SuperAdmin can delete package stage emails"
ON public.package_stage_emails
FOR DELETE
TO authenticated
USING (public.is_superadmin());

-- Create SuperAdmin-only policies for package_builder_audit_log
CREATE POLICY "SuperAdmin can view package builder audit log"
ON public.package_builder_audit_log
FOR SELECT
TO authenticated
USING (public.is_superadmin());

CREATE POLICY "SuperAdmin can insert package builder audit log"
ON public.package_builder_audit_log
FOR INSERT
TO authenticated
WITH CHECK (public.is_superadmin());