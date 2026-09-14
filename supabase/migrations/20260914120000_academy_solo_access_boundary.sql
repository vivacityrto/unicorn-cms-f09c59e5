-- Academy Solo MVP: establish a server-enforced Academy access boundary.
--
-- This is deliberately built on the existing tenant + tenant_users primitives.
-- It does not revive tenants.tenant_type, use a Sidekick package as a security
-- authority, create a new identity system, or change the commercial/billing
-- model. A later entitlement model can replace this helper without changing
-- the protected-content policy contract.

-- The existing Academy UI already treats tenants.academy_access_enabled as the
-- coarse access switch. This helper makes that switch meaningful at the RLS
-- boundary while preserving both existing RTO Academy users and academy_only
-- users whose mirrored tenant_members row is intentionally inactive.
CREATE OR REPLACE FUNCTION public.has_academy_access_safe(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    public.is_super_admin_safe(p_user_id)
    OR public.is_vivacity_team_safe(p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.tenant_users tu
      JOIN public.tenants t ON t.id = tu.tenant_id
      JOIN public.users u ON u.user_uuid = tu.user_id
      WHERE tu.user_id = p_user_id
        AND t.academy_access_enabled IS TRUE
        AND (t.academy_subscription_expires_at IS NULL OR t.academy_subscription_expires_at > now())
        AND (tu.access_scope IS NULL OR tu.access_scope IN ('full', 'academy_only'))
        AND u.disabled IS DISTINCT FROM TRUE
        AND u.archived IS DISTINCT FROM TRUE
    )
    OR EXISTS (
      SELECT 1
      FROM public.tenant_members tm
      JOIN public.tenants t ON t.id = tm.tenant_id
      JOIN public.users u ON u.user_uuid = tm.user_id
      WHERE tm.user_id = p_user_id
        AND tm.status = 'active'
        AND t.academy_access_enabled IS TRUE
        AND (t.academy_subscription_expires_at IS NULL OR t.academy_subscription_expires_at > now())
        AND u.disabled IS DISTINCT FROM TRUE
        AND u.archived IS DISTINCT FROM TRUE
    );
$$;

COMMENT ON FUNCTION public.has_academy_access_safe(uuid) IS
  'Recursion-safe Academy entitlement gate. Staff, active tenant members of an Academy-enabled tenant, and academy_only tenant_users may access Academy content. It intentionally does not depend on tenant_type or package mappings.';

REVOKE ALL ON FUNCTION public.has_academy_access_safe(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_academy_access_safe(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_academy_access_safe(uuid) TO authenticated, service_role;

-- Staff lifecycle writes go through one audited RPC. It updates only the
-- existing Academy access fields; it deliberately does not create an auth
-- identity, alter tenant_type, create a package, or touch RTO membership.
CREATE OR REPLACE FUNCTION public.manage_academy_solo_access(
  p_tenant_id bigint,
  p_action text,
  p_enabled boolean,
  p_max_users integer DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_is_solo_pilot boolean DEFAULT FALSE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_previous_enabled boolean;
  v_previous_expires_at timestamptz;
BEGIN
  IF NOT public.is_vivacity_team_safe((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'Forbidden: Academy Solo lifecycle is staff-only'
      USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN ('activate', 'suspend', 'reactivate', 'end', 'settings_updated') THEN
    RAISE EXCEPTION 'Invalid Academy Solo lifecycle action: %', p_action
      USING ERRCODE = '22023';
  END IF;

  SELECT academy_access_enabled, academy_subscription_expires_at
    INTO v_previous_enabled, v_previous_expires_at
  FROM public.tenants
  WHERE id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant not found: %', p_tenant_id
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.tenants
  SET academy_access_enabled = p_enabled,
      academy_max_users = CASE
        WHEN p_is_solo_pilot OR COALESCE(metadata, '{}'::jsonb) ? 'academy_solo' THEN 1
        ELSE p_max_users
      END,
      academy_subscription_expires_at = p_expires_at,
      metadata = CASE
        WHEN p_is_solo_pilot OR COALESCE(metadata, '{}'::jsonb) ? 'academy_solo' THEN
          jsonb_set(
            jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{academy_notes}',
              COALESCE(to_jsonb(p_notes), 'null'::jsonb),
              true
            ),
            '{academy_solo}',
            COALESCE(metadata -> 'academy_solo', '{}'::jsonb) || jsonb_build_object(
              'status', p_action,
              'last_changed_at', now(),
              'last_changed_by', (SELECT auth.uid())
            ),
            true
          )
        ELSE jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{academy_notes}',
          COALESCE(to_jsonb(p_notes), 'null'::jsonb),
          true
        )
      END
  WHERE id = p_tenant_id;

  INSERT INTO public.audit_eos_events (
    tenant_id, user_id, entity, entity_id, action, reason, details
  ) VALUES (
    p_tenant_id,
    (SELECT auth.uid()),
    'academy_solo_access',
    NULL,
    p_action,
    'Academy Solo lifecycle change',
    jsonb_build_object(
      'previous_enabled', v_previous_enabled,
      'enabled', p_enabled,
      'previous_expires_at', v_previous_expires_at,
      'expires_at', p_expires_at,
      'max_users', p_max_users,
      'notes', p_notes
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', p_tenant_id,
    'action', p_action,
    'enabled', p_enabled
  );
END;
$$;

COMMENT ON FUNCTION public.manage_academy_solo_access(bigint, text, boolean, integer, timestamptz, text, boolean) IS
  'Staff-only, audited Academy Solo pilot lifecycle update. Reuses the existing tenant access flag and does not create identities or modify RTO membership.';

REVOKE ALL ON FUNCTION public.manage_academy_solo_access(bigint, text, boolean, integer, timestamptz, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.manage_academy_solo_access(bigint, text, boolean, integer, timestamptz, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.manage_academy_solo_access(bigint, text, boolean, integer, timestamptz, text, boolean) TO authenticated, service_role;

-- This RPC is SECURITY DEFINER in the live Academy completion path, so its
-- own authorization must also fail closed after Solo access ends. Completed
-- history remains readable/returnable; an active enrolment cannot be completed
-- by a user whose Academy entitlement is no longer current.
CREATE OR REPLACE FUNCTION public.complete_academy_enrollment(p_enrollment_id bigint)
RETURNS public.academy_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_row public.academy_enrollments%ROWTYPE;
  v_required integer;
  v_completed integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_row
  FROM public.academy_enrollments
  WHERE id = p_enrollment_id AND user_id = v_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'enrolment_not_found_or_not_yours' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status = 'completed' THEN
    RETURN v_row;
  END IF;

  IF NOT public.has_academy_access_safe(v_user_id) THEN
    RAISE EXCEPTION 'academy_access_required' USING ERRCODE = '42501';
  END IF;

  IF v_row.status <> 'active' THEN
    RAISE EXCEPTION 'enrolment_not_active' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*) INTO v_required
  FROM public.academy_lessons l
  WHERE l.course_id = v_row.course_id AND l.is_published = true;

  IF COALESCE(v_required, 0) = 0 THEN
    RAISE EXCEPTION 'course_has_no_published_lessons' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(DISTINCT lp.lesson_id) INTO v_completed
  FROM public.academy_lesson_progress lp
  JOIN public.academy_lessons l ON l.id = lp.lesson_id
  WHERE lp.user_id = v_user_id
    AND lp.enrollment_id = v_row.id
    AND l.course_id = v_row.course_id
    AND l.is_published = true
    AND lp.is_completed = true;

  IF v_completed < v_required THEN
    RAISE EXCEPTION 'not_all_lessons_completed: % of % done', v_completed, v_required
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.academy_enrollments
  SET status = 'completed',
      completed_at = COALESCE(completed_at, now()),
      updated_at = now()
  WHERE id = v_row.id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.complete_academy_enrollment(bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.complete_academy_enrollment(bigint) FROM anon;

-- Course and module catalogue reads must not be available to every
-- authenticated user. Staff continue to use their existing manage policies.
DROP POLICY IF EXISTS "Academy courses: enrolled or staff view published" ON public.academy_courses;
DROP POLICY IF EXISTS "Academy courses: authenticated view published" ON public.academy_courses;
CREATE POLICY "Academy courses: Academy users view published"
  ON public.academy_courses AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    status = 'published'
    AND public.has_academy_access_safe((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Academy modules: view published" ON public.academy_modules;
DROP POLICY IF EXISTS "Academy modules: enrolled or staff view published" ON public.academy_modules;
DROP POLICY IF EXISTS "Academy modules: authenticated view published outline" ON public.academy_modules;
CREATE POLICY "Academy modules: Academy users view published outline"
  ON public.academy_modules AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    is_published = TRUE
    AND public.has_academy_access_safe((SELECT auth.uid()))
  );

-- Full lesson rows remain enrolment-gated. Preview lessons are still limited
-- to an active Academy entitlement; the outline view below is the catalogue
-- surface for pre-enrolment users.
DROP POLICY IF EXISTS "Academy lessons: view published" ON public.academy_lessons;
DROP POLICY IF EXISTS "Academy lessons: enrolled or staff view published" ON public.academy_lessons;
DROP POLICY IF EXISTS "Academy lessons: enrolled staff or preview view full" ON public.academy_lessons;
CREATE POLICY "Academy lessons: enrolled Academy users or preview"
  ON public.academy_lessons AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    is_published = TRUE
    AND public.has_academy_access_safe((SELECT auth.uid()))
    AND (
      is_preview = TRUE
      OR EXISTS (
        SELECT 1
        FROM public.academy_modules m
        JOIN public.academy_enrollments e ON e.course_id = m.course_id
        WHERE m.id = academy_lessons.module_id
          AND e.user_id = (SELECT auth.uid())
          AND e.revoked_at IS NULL
          AND (e.expires_at IS NULL OR e.expires_at > now())
          AND e.status IN ('active', 'completed')
      )
    )
  );

-- The outline view is intentionally structural-only, but it still needs the
-- same server-side Academy gate. Keep historical certificate/enrolment reads
-- separate so ended subscribers retain their learning record.
CREATE OR REPLACE VIEW public.v_academy_lesson_outline
WITH (security_invoker = false) AS
SELECT id, module_id, course_id, title, description, lesson_type,
       sort_order, is_published, is_preview, estimated_minutes
FROM public.academy_lessons
WHERE is_published = TRUE
  AND public.has_academy_access_safe((SELECT auth.uid()));

ALTER VIEW public.v_academy_lesson_outline OWNER TO postgres;
REVOKE ALL ON public.v_academy_lesson_outline FROM PUBLIC, anon;
GRANT SELECT ON public.v_academy_lesson_outline TO authenticated, service_role;

DROP POLICY IF EXISTS "Assessments: enrolled users view" ON public.academy_assessments;
DROP POLICY IF EXISTS "Assessments: enrolled or staff view" ON public.academy_assessments;
CREATE POLICY "Assessments: enrolled Academy users view"
  ON public.academy_assessments AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    is_published = TRUE
    AND public.has_academy_access_safe((SELECT auth.uid()))
    AND EXISTS (
      SELECT 1
      FROM public.academy_enrollments e
      WHERE e.course_id = academy_assessments.course_id
        AND e.user_id = (SELECT auth.uid())
        AND e.status IN ('active', 'completed')
    )
  );

DROP POLICY IF EXISTS "Questions: staff or enrolled learners view" ON public.academy_assessment_questions;
CREATE POLICY "Questions: Academy users with enrolment view"
  ON public.academy_assessment_questions AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.has_academy_access_safe((SELECT auth.uid()))
    AND EXISTS (
      SELECT 1
      FROM public.academy_assessments a
      JOIN public.academy_enrollments e
        ON e.course_id = a.course_id
       AND e.user_id = (SELECT auth.uid())
       AND e.status IN ('active', 'completed')
      WHERE a.id = academy_assessment_questions.assessment_id
        AND a.is_published = TRUE
    )
  );

-- Assessment attempts can be retained and viewed after access ends, but new
-- writes require a current Academy entitlement and an active/completed
-- enrolment for the assessment's course.
DROP POLICY IF EXISTS "Attempts: users manage own" ON public.academy_assessment_attempts;
CREATE POLICY "Attempts: users view own history"
  ON public.academy_assessment_attempts AS PERMISSIVE FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Attempts: active Academy users manage own"
  ON public.academy_assessment_attempts AS PERMISSIVE FOR ALL TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND public.has_academy_access_safe((SELECT auth.uid()))
    AND EXISTS (
      SELECT 1
      FROM public.academy_assessments a
      JOIN public.academy_enrollments e
        ON e.id = academy_assessment_attempts.enrollment_id
       AND e.course_id = a.course_id
       AND e.course_id = academy_assessment_attempts.course_id
       AND e.user_id = (SELECT auth.uid())
       AND e.status IN ('active', 'completed')
      WHERE a.id = academy_assessment_attempts.assessment_id
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.has_academy_access_safe((SELECT auth.uid()))
    AND EXISTS (
      SELECT 1
      FROM public.academy_assessments a
      JOIN public.academy_enrollments e
        ON e.id = academy_assessment_attempts.enrollment_id
       AND e.course_id = a.course_id
       AND e.course_id = academy_assessment_attempts.course_id
       AND e.user_id = (SELECT auth.uid())
       AND e.status IN ('active', 'completed')
      WHERE a.id = academy_assessment_attempts.assessment_id
    )
  );

-- Self-enrolment is available only to a user who already has an Academy
-- entitlement. The tenant-scoped branch also requires that exact tenant to be
-- Academy-enabled; this prevents cross-tenant enrolment by a multi-tenant user.
DROP POLICY IF EXISTS "Enrollments: users self-enrol" ON public.academy_enrollments;
CREATE POLICY "Enrollments: Academy users self-enrol"
  ON public.academy_enrollments AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND source = 'self_enrol'
    AND public.has_academy_access_safe((SELECT auth.uid()))
    AND (
      tenant_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.tenant_users tu
        JOIN public.tenants t ON t.id = tu.tenant_id
        WHERE tu.user_id = (SELECT auth.uid())
          AND tu.tenant_id = academy_enrollments.tenant_id
          AND t.academy_access_enabled IS TRUE
      )
    )
  );

-- Preserve SELECT access to a user's historical progress, while preventing
-- writes after access is suspended/ended.
DROP POLICY IF EXISTS "Lesson progress: users manage own" ON public.academy_lesson_progress;
CREATE POLICY "Lesson progress: users view own history"
  ON public.academy_lesson_progress AS PERMISSIVE FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Lesson progress: active Academy users manage own"
  ON public.academy_lesson_progress AS PERMISSIVE FOR ALL TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND public.has_academy_access_safe((SELECT auth.uid()))
    AND EXISTS (
      SELECT 1
      FROM public.academy_enrollments e
      WHERE e.id = academy_lesson_progress.enrollment_id
        AND e.course_id = academy_lesson_progress.course_id
        AND e.user_id = (SELECT auth.uid())
        AND e.status IN ('active', 'completed')
        AND EXISTS (
          SELECT 1
          FROM public.academy_lessons l
          WHERE l.id = academy_lesson_progress.lesson_id
            AND l.course_id = e.course_id
        )
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.has_academy_access_safe((SELECT auth.uid()))
    AND EXISTS (
      SELECT 1
      FROM public.academy_enrollments e
      WHERE e.id = academy_lesson_progress.enrollment_id
        AND e.course_id = academy_lesson_progress.course_id
        AND e.user_id = (SELECT auth.uid())
        AND e.status IN ('active', 'completed')
        AND EXISTS (
          SELECT 1
          FROM public.academy_lessons l
          WHERE l.id = academy_lesson_progress.lesson_id
            AND l.course_id = e.course_id
        )
    )
  );

COMMENT ON VIEW public.v_academy_lesson_outline IS
  'Structural Academy lesson outline for users with a current Academy entitlement. Sensitive lesson columns remain gated by academy_lessons RLS; historical enrolments and certificates are not revoked by this content boundary.';

NOTIFY pgrst, 'reload schema';
