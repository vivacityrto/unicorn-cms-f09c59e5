-- Hotfix: keep certificate issuance working when lesson completion happens
-- before a required assessment is passed.

CREATE OR REPLACE FUNCTION public.fn_academy_issue_certificate_for_enrollment(
  p_enrollment_id bigint,
  p_assessment_passed boolean DEFAULT false
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_enrollment public.academy_enrollments%ROWTYPE;
  v_cert_enabled boolean;
  v_course_title text;
  v_has_required_assessment boolean;
  v_passed_assessment boolean;
  v_existing_id bigint;
  v_new_id bigint;
  v_full_name text;
  v_email text;
BEGIN
  SELECT *
  INTO v_enrollment
  FROM public.academy_enrollments
  WHERE id = p_enrollment_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT certificate_enabled, title
  INTO v_cert_enabled, v_course_title
  FROM public.academy_courses
  WHERE id = v_enrollment.course_id;

  IF NOT COALESCE(v_cert_enabled, false) THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.academy_assessments
    WHERE course_id = v_enrollment.course_id
      AND is_required_for_certificate = true
      AND is_published = true
  )
  INTO v_has_required_assessment;

  IF v_has_required_assessment THEN
    SELECT p_assessment_passed OR EXISTS (
      SELECT 1
      FROM public.academy_assessment_attempts
      WHERE enrollment_id = v_enrollment.id
        AND user_id = v_enrollment.user_id
        AND passed = true
    )
    INTO v_passed_assessment;

    IF NOT COALESCE(v_passed_assessment, false) THEN
      RETURN NULL;
    END IF;
  END IF;

  SELECT id
  INTO v_existing_id
  FROM public.academy_certificates
  WHERE enrollment_id = v_enrollment.id
    AND user_id = v_enrollment.user_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  SELECT
    NULLIF(BTRIM(COALESCE(
      u.full_name,
      NULLIF(BTRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '')
    )), ''),
    u.email
  INTO v_full_name, v_email
  FROM public.users u
  WHERE u.user_uuid = v_enrollment.user_id
  LIMIT 1;

  INSERT INTO public.academy_certificates (
    course_id,
    enrollment_id,
    user_id,
    tenant_id,
    issued_at,
    issued_by,
    metadata
  )
  VALUES (
    v_enrollment.course_id,
    v_enrollment.id,
    v_enrollment.user_id,
    v_enrollment.tenant_id,
    now(),
    auth.uid(),
    jsonb_build_object(
      'issued_trigger', 'academy_completion_or_assessment_pass',
      'source', 'auto',
      'recipient_full_name', COALESCE(v_full_name, v_email, 'Academy Learner'),
      'recipient_email', v_email,
      'course_title', v_course_title,
      'issued_on', to_char(now() AT TIME ZONE 'Australia/Sydney', 'DD Month YYYY')
    )
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_academy_issue_certificate_for_enrollment(bigint, boolean) FROM anon, authenticated, PUBLIC;

CREATE OR REPLACE FUNCTION public.issue_academy_certificate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  PERFORM public.fn_academy_issue_certificate_for_enrollment(NEW.id, false);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.score_academy_attempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_assessment record;
  v_question record;
  v_total_points integer := 0;
  v_earned_points integer := 0;
  v_score integer;
  v_passed boolean;
  v_answer jsonb;
  v_selected_value text;
  v_is_correct boolean;
  v_attempt_number integer;
BEGIN
  IF NEW.submitted_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT pass_score, max_attempts
  INTO v_assessment
  FROM public.academy_assessments
  WHERE id = NEW.assessment_id;

  SELECT COALESCE(MAX(attempt_number), 0) + 1
  INTO v_attempt_number
  FROM public.academy_assessment_attempts
  WHERE assessment_id = NEW.assessment_id
    AND user_id = NEW.user_id;

  NEW.attempt_number := v_attempt_number;

  IF v_attempt_number > v_assessment.max_attempts THEN
    RAISE EXCEPTION
      'Maximum attempts (%) exceeded for assessment %',
      v_assessment.max_attempts, NEW.assessment_id;
  END IF;

  FOR v_question IN
    SELECT id, points, options
    FROM public.academy_assessment_questions
    WHERE assessment_id = NEW.assessment_id
  LOOP
    v_total_points := v_total_points + COALESCE(v_question.points, 0);

    SELECT elem
    INTO v_answer
    FROM jsonb_array_elements(COALESCE(NEW.answers_json, '[]'::jsonb)) AS elem
    WHERE (elem->>'question_id')::bigint = v_question.id
    LIMIT 1;

    IF v_answer IS NOT NULL THEN
      v_selected_value := v_answer->>'selected_value';

      SELECT COALESCE((opt->>'is_correct')::boolean, false)
      INTO v_is_correct
      FROM jsonb_array_elements(COALESCE(v_question.options, '[]'::jsonb)) AS opt
      WHERE opt->>'value' = v_selected_value
      LIMIT 1;

      IF v_is_correct THEN
        v_earned_points := v_earned_points + COALESCE(v_question.points, 0);
      END IF;
    END IF;
  END LOOP;

  IF v_total_points > 0 THEN
    v_score := ROUND((v_earned_points::numeric / v_total_points::numeric) * 100)::integer;
  ELSE
    v_score := 0;
  END IF;

  v_passed := v_score >= v_assessment.pass_score;
  NEW.score := v_score;
  NEW.passed := v_passed;

  IF v_passed THEN
    UPDATE public.academy_enrollments
    SET status = 'completed',
        completed_at = COALESCE(completed_at, now()),
        updated_at = now()
    WHERE id = NEW.enrollment_id
      AND status <> 'completed';

    PERFORM public.fn_academy_issue_certificate_for_enrollment(NEW.enrollment_id, true);
  END IF;

  RETURN NEW;
END;
$function$;

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

  SELECT *
  INTO v_row
  FROM public.academy_enrollments
  WHERE id = p_enrollment_id
    AND user_id = v_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'enrolment_not_found_or_not_yours' USING ERRCODE = 'P0002';
  END IF;

  IF v_row.status = 'completed' THEN
    RETURN v_row;
  END IF;

  IF v_row.status <> 'active' THEN
    RAISE EXCEPTION 'enrolment_not_active' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*)
  INTO v_required
  FROM public.academy_lessons l
  WHERE l.course_id = v_row.course_id
    AND l.is_published = true;

  IF COALESCE(v_required, 0) = 0 THEN
    RAISE EXCEPTION 'course_has_no_published_lessons' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(DISTINCT lp.lesson_id)
  INTO v_completed
  FROM public.academy_lesson_progress lp
  JOIN public.academy_lessons l ON l.id = lp.lesson_id
  WHERE lp.user_id = v_user_id
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

CREATE OR REPLACE FUNCTION public.complete_enrollment_as_impersonator(
  p_enrollment_id bigint,
  p_target_user_id uuid
)
RETURNS public.academy_enrollments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.academy_enrollments%ROWTYPE;
  v_required integer;
  v_completed integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users
    WHERE user_uuid = v_actor
      AND (lower(global_role) IN ('superadmin', 'admin') OR is_vivacity_internal = true)
  ) THEN
    RAISE EXCEPTION 'not_authorised_impersonator' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_row
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

  SELECT COUNT(*)
  INTO v_required
  FROM public.academy_lessons l
  WHERE l.course_id = v_row.course_id
    AND l.is_published = true;

  IF COALESCE(v_required, 0) = 0 THEN
    RAISE EXCEPTION 'course_has_no_published_lessons' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(DISTINCT lp.lesson_id)
  INTO v_completed
  FROM public.academy_lesson_progress lp
  JOIN public.academy_lessons l ON l.id = lp.lesson_id
  WHERE lp.user_id = p_target_user_id
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
