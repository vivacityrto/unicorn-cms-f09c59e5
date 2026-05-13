DROP FUNCTION IF EXISTS public.enrol_as_impersonator(bigint, uuid);

CREATE OR REPLACE FUNCTION public.enrol_as_impersonator(
  p_course_id      bigint,
  p_target_user_id uuid,
  p_tenant_id      bigint
)
RETURNS public.academy_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor    uuid := auth.uid();
  v_course   public.academy_courses%ROWTYPE;
  v_existing public.academy_enrollments%ROWTYPE;
  v_new_row  public.academy_enrollments%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_uuid = v_actor
      AND (lower(global_role) IN ('superadmin','admin')
           OR is_vivacity_internal = true)
  ) THEN
    RAISE EXCEPTION 'not_authorised_impersonator' USING ERRCODE = '42501';
  END IF;

  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_context_required' USING ERRCODE = '22004';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE user_uuid = p_target_user_id
  ) THEN
    RAISE EXCEPTION 'invalid_target_user' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_users
    WHERE user_id = p_target_user_id
      AND tenant_id = p_tenant_id
  ) THEN
    RAISE EXCEPTION 'target_user_not_in_tenant' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_course
  FROM public.academy_courses
  WHERE id = p_course_id;

  IF NOT FOUND OR v_course.status <> 'published' THEN
    RAISE EXCEPTION 'course_not_available' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_existing
  FROM public.academy_enrollments
  WHERE course_id = p_course_id
    AND user_id   = p_target_user_id
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.tenant_id <> p_tenant_id THEN
      RAISE EXCEPTION 'existing_enrolment_different_tenant' USING ERRCODE = 'P0002';
    END IF;
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

  INSERT INTO public.academy_enrollments (
    course_id, user_id, tenant_id, status, source,
    enrolled_at, enrolled_by, notes
  )
  VALUES (
    p_course_id,
    p_target_user_id,
    p_tenant_id,
    'active',
    'staff_impersonation',
    now(),
    v_actor,
    'Enrolled by staff impersonation; actor=' || v_actor::text || '; tenant=' || p_tenant_id::text
  )
  RETURNING * INTO v_new_row;

  RETURN v_new_row;
END;
$function$;

REVOKE ALL ON FUNCTION public.enrol_as_impersonator(bigint, uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enrol_as_impersonator(bigint, uuid, bigint) TO authenticated;

COMMENT ON FUNCTION public.enrol_as_impersonator(bigint, uuid, bigint) IS
  'Staff-only impersonation enrol. Requires explicit p_tenant_id matching the staff member''s active preview context. Validates target is a member of p_tenant_id. Sets source=''staff_impersonation'', enrolled_by=actor, user_id=target. Idempotent per (course_id, user_id). SECURITY DEFINER.';