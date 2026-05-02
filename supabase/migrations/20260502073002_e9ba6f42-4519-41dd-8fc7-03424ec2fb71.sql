-- =========================================================
-- Fix 1: tenant-note-files storage bucket — path-scoped tenant check
-- =========================================================
DROP POLICY IF EXISTS "Staff or members can view tenant note files" ON storage.objects;
DROP POLICY IF EXISTS "Staff or members can upload tenant note files" ON storage.objects;
DROP POLICY IF EXISTS "Staff or members can update tenant note files" ON storage.objects;
DROP POLICY IF EXISTS "Staff or members can delete tenant note files" ON storage.objects;

CREATE POLICY "Staff or tenant members can view tenant note files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'tenant-note-files'
  AND (
    is_super_admin_safe(auth.uid())
    OR is_vivacity_team_safe(auth.uid())
    OR has_tenant_access_safe(((storage.foldername(name))[1])::bigint, auth.uid())
  )
);

CREATE POLICY "Staff or tenant members can upload tenant note files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'tenant-note-files'
  AND (
    is_super_admin_safe(auth.uid())
    OR is_vivacity_team_safe(auth.uid())
    OR has_tenant_access_safe(((storage.foldername(name))[1])::bigint, auth.uid())
  )
);

CREATE POLICY "Staff or tenant members can update tenant note files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'tenant-note-files'
  AND (
    is_super_admin_safe(auth.uid())
    OR is_vivacity_team_safe(auth.uid())
    OR has_tenant_access_safe(((storage.foldername(name))[1])::bigint, auth.uid())
  )
);

CREATE POLICY "Staff or tenant members can delete tenant note files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'tenant-note-files'
  AND (
    is_super_admin_safe(auth.uid())
    OR is_vivacity_team_safe(auth.uid())
    OR has_tenant_access_safe(((storage.foldername(name))[1])::bigint, auth.uid())
  )
);

-- =========================================================
-- Fix 2: academy_assessment_questions — restrict to staff or enrolled learners
-- =========================================================
DROP POLICY IF EXISTS "Questions: authenticated users view" ON public.academy_assessment_questions;

CREATE POLICY "Questions: staff or enrolled learners view"
ON public.academy_assessment_questions
FOR SELECT
USING (
  -- Staff (Vivacity internal) can always view
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
      AND (u.global_role = ANY (ARRAY['superadmin','admin']) OR u.is_vivacity_internal = true)
  )
  OR
  -- Learners with an active enrollment in the related course
  EXISTS (
    SELECT 1
    FROM public.academy_assessments a
    JOIN public.academy_enrollments e
      ON e.course_id = a.course_id
     AND e.user_id = auth.uid()
     AND e.status = 'active'
    WHERE a.id = academy_assessment_questions.assessment_id
  )
);