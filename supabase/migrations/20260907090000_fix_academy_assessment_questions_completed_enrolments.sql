-- Learners complete their lessons before taking the completion assessment.
-- Once the final lesson is completed, the enrollment status changes from
-- active to completed. Keep the question access policy aligned with the
-- assessment-entry and player flows so completed learners can take the quiz.
BEGIN;

DROP POLICY IF EXISTS "Questions: staff or enrolled learners view"
  ON public.academy_assessment_questions;

CREATE POLICY "Questions: staff or enrolled learners view"
  ON public.academy_assessment_questions
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.user_uuid = (SELECT auth.uid())
        AND (
          lower(u.global_role) = ANY (ARRAY['superadmin'::text, 'admin'::text])
          OR u.is_vivacity_internal = true
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.academy_assessments a
      JOIN public.academy_enrollments e
        ON e.course_id = a.course_id
       AND e.user_id = (SELECT auth.uid())
       AND e.status = ANY (ARRAY['active'::text, 'completed'::text])
      WHERE a.id = academy_assessment_questions.assessment_id
        AND a.is_published = true
    )
  );

COMMIT;
