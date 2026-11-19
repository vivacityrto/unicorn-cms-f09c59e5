-- Read-only Academy staff dashboard. Not applied to a hosted database by this PR.
-- migration-target-project: yxkgdalkbrriasiyyrwk
-- A definer is needed because lesson progress SELECT is learner-only. Reuses
-- the existing admin lesson-detail is_vivacity gate; never changes table RLS.
CREATE OR REPLACE FUNCTION public.fn_academy_engagement_dashboard(
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL,
  p_tenant_id bigint DEFAULT NULL,
  p_source text DEFAULT 'self_enrol'
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.is_vivacity() IS NOT TRUE THEN
    RAISE EXCEPTION 'Forbidden: staff only' USING ERRCODE = '42501';
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('self_enrol', 'all') THEN
    RAISE EXCEPTION 'Unsupported enrolment source' USING ERRCODE = '22023';
  END IF;
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from > p_to THEN
    RAISE EXCEPTION 'From date must not be after to date' USING ERRCODE = '22023';
  END IF;

  WITH cohort AS (
    SELECT e.id, e.course_id, e.user_id,
      (e.completed_at IS NOT NULL OR e.status = 'completed') AS completed
    FROM public.academy_enrollments e
    JOIN public.users u ON u.user_uuid = e.user_id
    WHERE COALESCE(u.is_vivacity_internal, false) = false
      AND COALESCE(u.is_system_account, false) = false
      AND e.revoked_at IS NULL AND e.status IS DISTINCT FROM 'revoked'
      AND (p_tenant_id IS NULL OR e.tenant_id = p_tenant_id)
      AND (p_source = 'all' OR e.source = 'self_enrol')
      AND (p_from IS NULL OR e.enrolled_at >= (p_from::timestamp AT TIME ZONE 'Australia/Sydney'))
      AND (p_to IS NULL OR e.enrolled_at < ((p_to + 1)::timestamp AT TIME ZONE 'Australia/Sydney'))
  ), facts AS (
    SELECT e.*,
      EXISTS (
        SELECT 1 FROM public.academy_lesson_progress lp
        JOIN public.academy_lessons l ON l.id = lp.lesson_id AND l.course_id = e.course_id
        WHERE lp.enrollment_id = e.id AND lp.user_id = e.user_id AND lp.course_id = e.course_id
          AND l.lesson_type = 'video'
          AND (lp.started_at IS NOT NULL OR COALESCE(lp.last_position_seconds, 0) > 0 OR COALESCE(lp.watch_seconds, 0) > 0)
      ) AS video_started,
      (SELECT count(*) FROM public.academy_certificates c
        WHERE c.enrollment_id = e.id AND c.user_id = e.user_id AND c.course_id = e.course_id
          AND c.revoked_at IS NULL AND c.issued_at IS NOT NULL) AS certificates
    FROM cohort e
  ), course_counts AS (
    SELECT f.course_id, COALESCE(c.title, 'Course ' || f.course_id::text) AS title,
      count(*) AS enrolments, count(DISTINCT f.user_id) AS learners,
      count(DISTINCT f.user_id) FILTER (WHERE f.video_started) AS video_started,
      count(*) FILTER (WHERE f.completed) AS completed,
      sum(f.certificates) AS certificates
    FROM facts f LEFT JOIN public.academy_courses c ON c.id = f.course_id
    GROUP BY f.course_id, c.title
  )
  SELECT jsonb_build_object(
    'generated_at', CURRENT_TIMESTAMP,
    'totals', jsonb_build_object(
      'enrolments', count(*), 'learners', count(DISTINCT user_id),
      'video_started', count(DISTINCT user_id) FILTER (WHERE video_started),
      'completed', count(*) FILTER (WHERE completed),
      'certificates', COALESCE(sum(certificates), 0)),
    'courses', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.completed DESC, c.enrolments DESC, c.title) FROM course_counts c), '[]'::jsonb)
  ) INTO v_result FROM facts;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_academy_engagement_dashboard(date, date, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_academy_engagement_dashboard(date, date, bigint, text) TO authenticated;
