-- Restore the Academy Builder's staff read path while keeping learner reads
-- restricted to users with an active/completed course enrolment.
--
-- The Academy Solo access-boundary migration replaced the former combined
-- staff-or-enrolled SELECT policy with an enrolment-only policy. Staff still
-- had write policies, but the builder's direct SELECT consequently returned
-- zero rows under RLS.
BEGIN;

CREATE POLICY "Questions: Vivacity staff view"
  ON public.academy_assessment_questions
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
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
  );

COMMIT;
