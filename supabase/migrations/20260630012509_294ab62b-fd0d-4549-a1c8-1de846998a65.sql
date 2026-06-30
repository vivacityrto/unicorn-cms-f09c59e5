CREATE OR REPLACE FUNCTION public.pdp_evidence_items_fill_academy_duration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lesson_minutes int;
  v_course_minutes int;
BEGIN
  IF NEW.evidence_type = 'academy_completion'
     AND NEW.source_enrollment_id IS NOT NULL
     AND NEW.duration_minutes IS NULL THEN

    SELECT COALESCE(SUM(l.estimated_minutes), 0)::int
      INTO v_lesson_minutes
      FROM public.academy_lessons l
      JOIN public.academy_enrollments e ON e.course_id = l.course_id
     WHERE e.id = NEW.source_enrollment_id
       AND l.is_published = true;

    IF v_lesson_minutes > 0 THEN
      NEW.duration_minutes := v_lesson_minutes;
    ELSE
      SELECT c.estimated_minutes
        INTO v_course_minutes
        FROM public.academy_courses c
        JOIN public.academy_enrollments e ON e.course_id = c.id
       WHERE e.id = NEW.source_enrollment_id;

      IF v_course_minutes IS NOT NULL AND v_course_minutes > 0 THEN
        NEW.duration_minutes := v_course_minutes;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.pdp_evidence_items_fill_academy_duration() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pdp_evidence_items_fill_academy_duration() TO service_role;

DROP TRIGGER IF EXISTS trg_pdp_evidence_fill_academy_duration ON public.pdp_evidence_items;

CREATE TRIGGER trg_pdp_evidence_fill_academy_duration
  BEFORE INSERT ON public.pdp_evidence_items
  FOR EACH ROW
  EXECUTE FUNCTION public.pdp_evidence_items_fill_academy_duration();