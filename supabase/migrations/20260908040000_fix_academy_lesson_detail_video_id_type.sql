-- L10 item #16 — "Enrolment Progress drawer's Lessons section has never
-- shown real lesson data." fn_academy_enrollment_lesson_detail's own
-- RETURNS TABLE declares column 9 (video_id) as `text`, but
-- academy_lessons.video_id is genuinely `uuid` — every call has always
-- errored with `42804: returned type uuid does not match expected type
-- text in column 9`, so the Lessons section always fell back to its
-- empty state regardless of real course/enrolment content. Confirmed via
-- information_schema against every other selected column too — video_id
-- is the only mismatch; the other 15 columns' declared types already
-- match their source columns exactly.
--
-- Carl explicitly authorized this fix as part of continuing the P4-D
-- queue. DROP FUNCTION first because CREATE OR REPLACE FUNCTION cannot
-- change a function's return type (including a column type inside
-- RETURNS TABLE) — see this repo's own "changing a Postgres function's
-- parameter list requires DROP FUNCTION first" guardrail.
--
-- migration-target-project: yxkgdalkbrriasiyyrwk

DROP FUNCTION IF EXISTS public.fn_academy_enrollment_lesson_detail(bigint);

CREATE FUNCTION public.fn_academy_enrollment_lesson_detail(p_enrollment_id bigint)
 RETURNS TABLE(lesson_id bigint, module_id bigint, module_title text, module_sort_order integer, lesson_title text, lesson_sort_order integer, lesson_type text, estimated_minutes integer, video_id uuid, video_duration_seconds integer, is_completed boolean, completion_percentage numeric, watch_seconds integer, last_position_seconds integer, started_at timestamp with time zone, completed_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- Preserve the exact grants that existed before the drop (confirmed via
-- information_schema.routine_privileges prior to this migration).
GRANT EXECUTE ON FUNCTION public.fn_academy_enrollment_lesson_detail(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_academy_enrollment_lesson_detail(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_academy_enrollment_lesson_detail(bigint) TO postgres;
