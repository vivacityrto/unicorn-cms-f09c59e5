-- ============================================================
-- Academy Enrolments Manager — Admin RPCs (staff-only)
-- ============================================================

-- 1) Dashboard stats (6 tiles in one call)
CREATE OR REPLACE FUNCTION public.fn_academy_enrollment_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_vivacity() THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  SELECT jsonb_build_object(
    'total',         COUNT(*),
    'active',        COUNT(*) FILTER (WHERE status = 'active' AND (expires_at IS NULL OR expires_at > now())),
    'completed',     COUNT(*) FILTER (WHERE status = 'completed'),
    'expired',       COUNT(*) FILTER (WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= now()),
    'revoked',       COUNT(*) FILTER (WHERE status = 'revoked' OR revoked_at IS NOT NULL),
    'auto_lifetime', COUNT(*) FILTER (WHERE source IN ('auto_package','auto_package_backfill'))
  )
  INTO v_result
  FROM public.academy_enrollments;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_academy_enrollment_stats() TO authenticated;

-- 2) Lesson detail for an enrolment
CREATE OR REPLACE FUNCTION public.fn_academy_enrollment_lesson_detail(p_enrollment_id bigint)
RETURNS TABLE (
  lesson_id bigint,
  module_id bigint,
  module_title text,
  module_sort_order integer,
  lesson_title text,
  lesson_sort_order integer,
  lesson_type text,
  estimated_minutes integer,
  video_id text,
  video_duration_seconds integer,
  is_completed boolean,
  completion_percentage numeric,
  watch_seconds integer,
  last_position_seconds integer,
  started_at timestamptz,
  completed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course_id bigint;
  v_user_id uuid;
BEGIN
  IF NOT public.is_vivacity() THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  SELECT e.course_id, e.user_id
    INTO v_course_id, v_user_id
  FROM public.academy_enrollments e
  WHERE e.id = p_enrollment_id;

  IF v_course_id IS NULL THEN
    RAISE EXCEPTION 'Enrolment not found: %', p_enrollment_id;
  END IF;

  RETURN QUERY
  SELECT
    l.id::bigint                     AS lesson_id,
    m.id::bigint                     AS module_id,
    m.title                          AS module_title,
    m.sort_order                     AS module_sort_order,
    l.title                          AS lesson_title,
    l.sort_order                     AS lesson_sort_order,
    l.lesson_type,
    l.estimated_minutes,
    l.video_id,
    tv.duration_seconds              AS video_duration_seconds,
    COALESCE(p.is_completed, false)  AS is_completed,
    COALESCE(p.completion_percentage, 0)::numeric AS completion_percentage,
    COALESCE(p.watch_seconds, 0)     AS watch_seconds,
    COALESCE(p.last_position_seconds, 0) AS last_position_seconds,
    p.started_at,
    p.completed_at
  FROM public.academy_lessons l
  JOIN public.academy_modules m ON m.id = l.module_id
  LEFT JOIN public.training_videos tv ON tv.id = l.video_id
  LEFT JOIN public.academy_lesson_progress p
    ON p.lesson_id = l.id AND p.enrollment_id = p_enrollment_id
  WHERE l.course_id = v_course_id
    AND COALESCE(l.is_published, true) = true
  ORDER BY m.sort_order, l.sort_order;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_academy_enrollment_lesson_detail(bigint) TO authenticated;

-- 3) Revoke enrolment
CREATE OR REPLACE FUNCTION public.fn_academy_admin_revoke_enrollment(
  p_enrollment_id bigint,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.academy_enrollments%ROWTYPE;
BEGIN
  IF NOT public.is_vivacity() THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  UPDATE public.academy_enrollments
     SET status        = 'revoked',
         revoked_at    = now(),
         revoked_by    = auth.uid(),
         revoke_reason = p_reason,
         updated_at    = now()
   WHERE id = p_enrollment_id
   RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrolment not found: %', p_enrollment_id;
  END IF;

  RETURN jsonb_build_object('id', v_row.id, 'status', v_row.status, 'revoked_at', v_row.revoked_at);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_academy_admin_revoke_enrollment(bigint, text) TO authenticated;

-- 4) Reactivate enrolment
CREATE OR REPLACE FUNCTION public.fn_academy_admin_reactivate_enrollment(p_enrollment_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.academy_enrollments%ROWTYPE;
BEGIN
  IF NOT public.is_vivacity() THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  UPDATE public.academy_enrollments
     SET status        = 'active',
         revoked_at    = NULL,
         revoked_by    = NULL,
         revoke_reason = NULL,
         updated_at    = now()
   WHERE id = p_enrollment_id
   RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrolment not found: %', p_enrollment_id;
  END IF;

  RETURN jsonb_build_object('id', v_row.id, 'status', v_row.status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_academy_admin_reactivate_enrollment(bigint) TO authenticated;

-- 5) Extend expiry
CREATE OR REPLACE FUNCTION public.fn_academy_admin_extend_expiry(
  p_enrollment_id bigint,
  p_new_expiry timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.academy_enrollments%ROWTYPE;
BEGIN
  IF NOT public.is_vivacity() THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  UPDATE public.academy_enrollments
     SET expires_at = p_new_expiry,
         updated_at = now()
   WHERE id = p_enrollment_id
   RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrolment not found: %', p_enrollment_id;
  END IF;

  RETURN jsonb_build_object('id', v_row.id, 'expires_at', v_row.expires_at);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_academy_admin_extend_expiry(bigint, timestamptz) TO authenticated;

-- 6) Mark lesson complete (admin override)
CREATE OR REPLACE FUNCTION public.fn_academy_admin_mark_lesson_complete(
  p_enrollment_id bigint,
  p_lesson_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrollment public.academy_enrollments%ROWTYPE;
  v_lesson public.academy_lessons%ROWTYPE;
  v_progress_id bigint;
BEGIN
  IF NOT public.is_vivacity() THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  SELECT * INTO v_enrollment FROM public.academy_enrollments WHERE id = p_enrollment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrolment not found: %', p_enrollment_id;
  END IF;

  SELECT * INTO v_lesson FROM public.academy_lessons WHERE id = p_lesson_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lesson not found: %', p_lesson_id;
  END IF;

  INSERT INTO public.academy_lesson_progress (
    enrollment_id, course_id, lesson_id, user_id,
    is_completed, completion_percentage, started_at, completed_at, updated_at
  )
  VALUES (
    p_enrollment_id, v_enrollment.course_id, p_lesson_id, v_enrollment.user_id,
    true, 100, COALESCE(now(), now()), now(), now()
  )
  ON CONFLICT (enrollment_id, lesson_id) DO UPDATE
    SET is_completed = true,
        completion_percentage = 100,
        completed_at = COALESCE(public.academy_lesson_progress.completed_at, now()),
        updated_at = now()
  RETURNING id INTO v_progress_id;

  RETURN jsonb_build_object('progress_id', v_progress_id, 'lesson_id', p_lesson_id, 'is_completed', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_academy_admin_mark_lesson_complete(bigint, bigint) TO authenticated;

-- 7) Reset lesson progress
CREATE OR REPLACE FUNCTION public.fn_academy_admin_reset_lesson(
  p_enrollment_id bigint,
  p_lesson_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_vivacity() THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  DELETE FROM public.academy_lesson_progress
   WHERE enrollment_id = p_enrollment_id
     AND lesson_id     = p_lesson_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('deleted', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_academy_admin_reset_lesson(bigint, bigint) TO authenticated;

-- 8) Issue certificate (manual)
CREATE OR REPLACE FUNCTION public.fn_academy_admin_issue_certificate(p_enrollment_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrollment public.academy_enrollments%ROWTYPE;
  v_existing_id bigint;
  v_new_id bigint;
  v_cert_number text;
BEGIN
  IF NOT public.is_vivacity() THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  SELECT * INTO v_enrollment FROM public.academy_enrollments WHERE id = p_enrollment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrolment not found: %', p_enrollment_id;
  END IF;

  SELECT id INTO v_existing_id FROM public.academy_certificates
   WHERE enrollment_id = p_enrollment_id
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('certificate_id', v_existing_id, 'created', false);
  END IF;

  INSERT INTO public.academy_certificates (
    enrollment_id, course_id, user_id, tenant_id,
    issued_at, issued_by
  )
  VALUES (
    p_enrollment_id, v_enrollment.course_id, v_enrollment.user_id, v_enrollment.tenant_id,
    now(), auth.uid()
  )
  RETURNING id, certificate_number INTO v_new_id, v_cert_number;

  RETURN jsonb_build_object('certificate_id', v_new_id, 'certificate_number', v_cert_number, 'created', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_academy_admin_issue_certificate(bigint) TO authenticated;

-- 9) Revoke certificate
CREATE OR REPLACE FUNCTION public.fn_academy_admin_revoke_certificate(
  p_certificate_id bigint,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
BEGIN
  IF NOT public.is_vivacity() THEN
    RAISE EXCEPTION 'Forbidden: staff only';
  END IF;

  UPDATE public.academy_certificates
     SET revoked_at    = now(),
         revoked_by    = auth.uid(),
         revoke_reason = p_reason
   WHERE id = p_certificate_id
   RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Certificate not found: %', p_certificate_id;
  END IF;

  RETURN jsonb_build_object('certificate_id', v_id, 'revoked_at', now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_academy_admin_revoke_certificate(bigint, text) TO authenticated;