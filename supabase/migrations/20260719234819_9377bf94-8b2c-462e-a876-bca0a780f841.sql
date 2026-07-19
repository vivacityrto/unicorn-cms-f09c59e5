-- =========================================================================
-- M1 — reconcile_academy_courses_policy_drift
-- =========================================================================
DROP POLICY IF EXISTS "Academy courses: authenticated view published" ON public.academy_courses;
CREATE POLICY "Academy courses: authenticated view published"
  ON public.academy_courses AS PERMISSIVE FOR SELECT TO authenticated
  USING (status = 'published');

-- =========================================================================
-- M2 — academy_modules_widen_outline_select
-- =========================================================================
DROP POLICY IF EXISTS "Academy modules: enrolled or staff view published" ON public.academy_modules;

CREATE POLICY "Academy modules: authenticated view published outline"
  ON public.academy_modules AS PERMISSIVE FOR SELECT TO authenticated
  USING (is_published = true);

-- =========================================================================
-- M3 — academy_lessons_gated_full_row_plus_outline_view
-- =========================================================================
DROP POLICY IF EXISTS "Academy lessons: enrolled or staff view published" ON public.academy_lessons;

CREATE POLICY "Academy lessons: enrolled staff or preview view full"
  ON public.academy_lessons AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    is_published = true
    AND (
      public.is_vivacity_team_safe(auth.uid())
      OR is_preview = true
      OR EXISTS (
        SELECT 1
        FROM public.academy_modules m
        JOIN public.academy_enrollments e ON e.course_id = m.course_id
        WHERE m.id = academy_lessons.module_id
          AND e.user_id = auth.uid()
          AND e.revoked_at IS NULL
          AND (e.expires_at IS NULL OR e.expires_at > now())
          AND e.status IN ('active','completed')
      )
    )
  );

-- Definer-style bypass view: structural columns only, is_published rows only.
-- Deliberately security_invoker=false + OWNER=postgres so non-enrolled authenticated
-- users can read the outline while the base table stays gated for sensitive columns.
CREATE OR REPLACE VIEW public.v_academy_lesson_outline
WITH (security_invoker = false) AS
SELECT id, module_id, course_id, title, description, lesson_type,
       sort_order, is_published, is_preview, estimated_minutes
FROM public.academy_lessons
WHERE is_published = true;

ALTER VIEW public.v_academy_lesson_outline OWNER TO postgres;
REVOKE ALL ON public.v_academy_lesson_outline FROM PUBLIC;
GRANT SELECT ON public.v_academy_lesson_outline TO authenticated, service_role;

COMMENT ON VIEW public.v_academy_lesson_outline IS
  'Definer-style bypass view over academy_lessons exposing only structural columns for the pre-enrolment course outline. Sensitive columns (content_markdown, video_id, resource_id) remain reachable only via the base table under its gated RLS policy.';

NOTIFY pgrst, 'reload schema';

-- =========================================================================
-- Rollback statements (NOT executed — committed alongside for reference)
-- =========================================================================
-- R1: revert M1 (no-op relative to today)
--   DROP POLICY IF EXISTS "Academy courses: authenticated view published" ON public.academy_courses;
--   CREATE POLICY "Academy courses: authenticated view published"
--     ON public.academy_courses AS PERMISSIVE FOR SELECT TO authenticated
--     USING (status = 'published');
--
-- R2: revert M2
--   DROP POLICY IF EXISTS "Academy modules: authenticated view published outline" ON public.academy_modules;
--   CREATE POLICY "Academy modules: enrolled or staff view published"
--     ON public.academy_modules AS PERMISSIVE FOR SELECT TO authenticated
--     USING (
--       is_published = true
--       AND (
--         public.is_vivacity_team_safe(auth.uid())
--         OR EXISTS (
--           SELECT 1 FROM public.academy_enrollments e
--           WHERE e.course_id = academy_modules.course_id
--             AND e.user_id = auth.uid()
--         )
--       )
--     );
--
-- R3: revert M3
--   DROP VIEW IF EXISTS public.v_academy_lesson_outline;
--   DROP POLICY IF EXISTS "Academy lessons: enrolled staff or preview view full" ON public.academy_lessons;
--   CREATE POLICY "Academy lessons: enrolled or staff view published"
--     ON public.academy_lessons AS PERMISSIVE FOR SELECT TO authenticated
--     USING (
--       is_published = true
--       AND (
--         public.is_vivacity_team_safe(auth.uid())
--         OR EXISTS (
--           SELECT 1
--           FROM public.academy_modules m
--           JOIN public.academy_enrollments e ON e.course_id = m.course_id
--           WHERE m.id = academy_lessons.module_id
--             AND e.user_id = auth.uid()
--         )
--       )
--     );