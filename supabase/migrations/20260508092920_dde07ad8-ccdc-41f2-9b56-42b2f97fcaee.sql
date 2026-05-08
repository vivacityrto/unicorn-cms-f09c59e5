-- ============================================================
-- academy_impersonation_backend_v1
-- ============================================================

-- (a) Backfill is_vivacity_internal for SuperAdmins, with exact-count guard
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.users
  WHERE global_role = 'SuperAdmin'
    AND is_vivacity_internal IS DISTINCT FROM true;

  IF v_count <> 2 THEN
    RAISE EXCEPTION
      'academy_impersonation_backend_v1 backfill aborted: expected exactly 2 SuperAdmin rows needing is_vivacity_internal=true, found %',
      v_count;
  END IF;

  UPDATE public.users
  SET is_vivacity_internal = true,
      updated_at = now()
  WHERE global_role = 'SuperAdmin'
    AND is_vivacity_internal IS DISTINCT FROM true;
END $$;

-- (b) Rewrite academy_* RLS policies — case-insensitive global_role check.
-- Every policy below is staff-only (cmd ALL, USING-only) except the
-- assessment_questions SELECT policy which preserves its enrolled-learner
-- OR-branch verbatim.

-- academy_assessment_attempts
DROP POLICY IF EXISTS "Attempts: Vivacity staff view all" ON public.academy_assessment_attempts;
CREATE POLICY "Attempts: Vivacity staff view all"
ON public.academy_assessment_attempts
AS PERMISSIVE
FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
      AND (lower(u.global_role) IN ('superadmin','admin')
           OR u.is_vivacity_internal = true)
  )
);

-- academy_assessment_questions (ALL: staff manage)
DROP POLICY IF EXISTS "Questions: Vivacity staff manage" ON public.academy_assessment_questions;
CREATE POLICY "Questions: Vivacity staff manage"
ON public.academy_assessment_questions
AS PERMISSIVE
FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
      AND (lower(u.global_role) IN ('superadmin','admin')
           OR u.is_vivacity_internal = true)
  )
);

-- academy_assessment_questions (SELECT: staff OR enrolled learners)
DROP POLICY IF EXISTS "Questions: staff or enrolled learners view" ON public.academy_assessment_questions;
CREATE POLICY "Questions: staff or enrolled learners view"
ON public.academy_assessment_questions
AS PERMISSIVE
FOR SELECT
TO public
USING (
  (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
      AND (lower(u.global_role) IN ('superadmin','admin')
           OR u.is_vivacity_internal = true)
  ))
  OR (EXISTS (
    SELECT 1
    FROM public.academy_assessments a
    JOIN public.academy_enrollments e
      ON e.course_id = a.course_id
     AND e.user_id   = auth.uid()
     AND e.status    = 'active'
    WHERE a.id = academy_assessment_questions.assessment_id
  ))
);

-- academy_assessments
DROP POLICY IF EXISTS "Assessments: Vivacity staff manage" ON public.academy_assessments;
CREATE POLICY "Assessments: Vivacity staff manage"
ON public.academy_assessments
AS PERMISSIVE
FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
      AND (lower(u.global_role) IN ('superadmin','admin')
           OR u.is_vivacity_internal = true)
  )
);

-- academy_certificates
DROP POLICY IF EXISTS "Certificates: Vivacity staff manage all" ON public.academy_certificates;
CREATE POLICY "Certificates: Vivacity staff manage all"
ON public.academy_certificates
AS PERMISSIVE
FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
      AND (lower(u.global_role) IN ('superadmin','admin')
           OR u.is_vivacity_internal = true)
  )
);

-- academy_courses
DROP POLICY IF EXISTS "Academy courses: Vivacity staff manage all" ON public.academy_courses;
CREATE POLICY "Academy courses: Vivacity staff manage all"
ON public.academy_courses
AS PERMISSIVE
FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
      AND (lower(u.global_role) IN ('superadmin','admin')
           OR u.is_vivacity_internal = true)
  )
);

-- academy_enrollments
DROP POLICY IF EXISTS "Enrollments: Vivacity staff manage all" ON public.academy_enrollments;
CREATE POLICY "Enrollments: Vivacity staff manage all"
ON public.academy_enrollments
AS PERMISSIVE
FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
      AND (lower(u.global_role) IN ('superadmin','admin')
           OR u.is_vivacity_internal = true)
  )
);

-- academy_lesson_progress
DROP POLICY IF EXISTS "Lesson progress: Vivacity staff view all" ON public.academy_lesson_progress;
CREATE POLICY "Lesson progress: Vivacity staff view all"
ON public.academy_lesson_progress
AS PERMISSIVE
FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
      AND (lower(u.global_role) IN ('superadmin','admin')
           OR u.is_vivacity_internal = true)
  )
);

-- academy_lessons
DROP POLICY IF EXISTS "Academy lessons: Vivacity staff manage" ON public.academy_lessons;
CREATE POLICY "Academy lessons: Vivacity staff manage"
ON public.academy_lessons
AS PERMISSIVE
FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
      AND (lower(u.global_role) IN ('superadmin','admin')
           OR u.is_vivacity_internal = true)
  )
);

-- academy_modules
DROP POLICY IF EXISTS "Academy modules: Vivacity staff manage" ON public.academy_modules;
CREATE POLICY "Academy modules: Vivacity staff manage"
ON public.academy_modules
AS PERMISSIVE
FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
      AND (lower(u.global_role) IN ('superadmin','admin')
           OR u.is_vivacity_internal = true)
  )
);

-- academy_package_course_rules
DROP POLICY IF EXISTS "Package course rules: Vivacity staff manage" ON public.academy_package_course_rules;
CREATE POLICY "Package course rules: Vivacity staff manage"
ON public.academy_package_course_rules
AS PERMISSIVE
FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_uuid = auth.uid()
      AND (lower(u.global_role) IN ('superadmin','admin')
           OR u.is_vivacity_internal = true)
  )
);

-- (c) enrol_as_impersonator
CREATE OR REPLACE FUNCTION public.enrol_as_impersonator(
  p_course_id      bigint,
  p_target_user_id uuid
)
RETURNS public.academy_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor      uuid := auth.uid();
  v_tenant_id  bigint;
  v_course     public.academy_courses%ROWTYPE;
  v_existing   public.academy_enrollments%ROWTYPE;
  v_new_row    public.academy_enrollments%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Caller must be staff
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = v_actor
      AND (lower(global_role) IN ('superadmin','admin')
           OR is_vivacity_internal = true)
  ) THEN
    RAISE EXCEPTION 'not_authorised_impersonator' USING ERRCODE = '42501';
  END IF;

  -- Target user must exist and have at least one tenant_users row
  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE user_uuid = p_target_user_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.tenant_users WHERE user_id = p_target_user_id
  ) THEN
    RAISE EXCEPTION 'invalid_target_user' USING ERRCODE = 'P0002';
  END IF;

  -- Course must exist and be published
  SELECT * INTO v_course
  FROM public.academy_courses
  WHERE id = p_course_id;

  IF NOT FOUND OR v_course.status <> 'published' THEN
    RAISE EXCEPTION 'course_not_available' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent: existing row?
  SELECT * INTO v_existing
  FROM public.academy_enrollments
  WHERE course_id = p_course_id
    AND user_id   = p_target_user_id
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.status = 'revoked' THEN
      UPDATE public.academy_enrollments
      SET    status        = 'active',
             revoked_at    = NULL,
             revoked_by    = NULL,
             revoke_reason = NULL,
             updated_at    = now()
      WHERE  id = v_existing.id
      RETURNING * INTO v_new_row;
      RETURN v_new_row;
    END IF;
    RETURN v_existing;
  END IF;

  -- Resolve target's first tenant
  SELECT tu.tenant_id
  INTO   v_tenant_id
  FROM   public.tenant_users tu
  WHERE  tu.user_id = p_target_user_id
  ORDER BY tu.created_at ASC
  LIMIT 1;

  INSERT INTO public.academy_enrollments (
    course_id, user_id, tenant_id, status, source,
    enrolled_at, enrolled_by, notes
  )
  VALUES (
    p_course_id,
    p_target_user_id,
    v_tenant_id,
    'active',
    'staff_impersonation',
    now(),
    v_actor,
    'Enrolled by staff impersonation; actor=' || v_actor::text
  )
  RETURNING * INTO v_new_row;

  RETURN v_new_row;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.enrol_as_impersonator(bigint, uuid) TO authenticated;

COMMENT ON FUNCTION public.enrol_as_impersonator(bigint, uuid) IS
  'Staff-only impersonation enrol. Sets academy_enrollments.source = ''staff_impersonation'' (a documented but unconstrained source value), enrolled_by = caller (actor), user_id = target. Idempotent. SECURITY DEFINER.';

-- (d) complete_enrollment_as_impersonator
CREATE OR REPLACE FUNCTION public.complete_enrollment_as_impersonator(
  p_enrollment_id  bigint,
  p_target_user_id uuid
)
RETURNS public.academy_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor     uuid := auth.uid();
  v_row       public.academy_enrollments%ROWTYPE;
  v_required  integer;
  v_completed integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  -- Caller must be staff
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = v_actor
      AND (lower(global_role) IN ('superadmin','admin')
           OR is_vivacity_internal = true)
  ) THEN
    RAISE EXCEPTION 'not_authorised_impersonator' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.academy_enrollments
  WHERE id = p_enrollment_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'enrolment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.user_id <> p_target_user_id THEN
    RAISE EXCEPTION 'enrolment_user_mismatch' USING ERRCODE = '22023';
  END IF;

  IF v_row.status = 'completed' THEN
    RETURN v_row;
  END IF;

  IF v_row.status <> 'active' THEN
    RAISE EXCEPTION 'enrolment_not_active' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*) INTO v_required
  FROM public.academy_lessons l
  WHERE l.course_id    = v_row.course_id
    AND l.is_published = true;

  IF COALESCE(v_required, 0) = 0 THEN
    RAISE EXCEPTION 'course_has_no_published_lessons' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(DISTINCT lp.lesson_id) INTO v_completed
  FROM public.academy_lesson_progress lp
  JOIN public.academy_lessons l ON l.id = lp.lesson_id
  WHERE lp.user_id     = p_target_user_id
    AND l.course_id    = v_row.course_id
    AND l.is_published = true
    AND lp.status      = 'completed';

  IF v_completed < v_required THEN
    RAISE EXCEPTION 'not_all_lessons_completed: % of % done', v_completed, v_required
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.academy_enrollments
  SET    status       = 'completed',
         completed_at = now(),
         updated_at   = now()
  WHERE  id = v_row.id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.complete_enrollment_as_impersonator(bigint, uuid) TO authenticated;

COMMENT ON FUNCTION public.complete_enrollment_as_impersonator(bigint, uuid) IS
  'Staff-only impersonation completion mirror of complete_academy_enrollment(). Acts on target user, fires the certificate trigger. SECURITY DEFINER.';

-- (e) Document the new source value on existing self-enrol RPC.
COMMENT ON FUNCTION public.enrol_in_academy_course(bigint) IS
  'Self-enrol an authenticated learner. Valid academy_enrollments.source values (no DB constraint, convention only): ''self_enrol'' (this fn), ''staff_impersonation'' (enrol_as_impersonator).';

COMMENT ON COLUMN public.academy_enrollments.source IS
  'Origin of the enrolment row. Conventional values (no CHECK constraint): ''self_enrol'', ''staff_impersonation''. Other historical values may exist.';