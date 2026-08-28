-- One-time data backfill: 66 courses (60 published, plus a handful in other
-- statuses) had academy_courses.estimated_minutes = NULL even though every
-- one of their lessons already carries a valid academy_lessons.estimated_minutes
-- — the rollup was simply never computed for them. This sets exactly the
-- value the Academy Builder's own "Auto-calculated from lessons ... Use this
-- value" control would set (same v_academy_course_total_minutes view, same
-- unfiltered-by-published-status sum), so it matches what a staff member
-- clicking that button would have produced.
--
-- Only touches rows where estimated_minutes IS NULL and the computed total
-- is > 0 — never overwrites a value someone already set (manually or
-- otherwise), and leaves genuinely lesson-less courses as NULL rather than 0
-- (both render as "—" client-side, so there's no data reason to prefer 0).
UPDATE public.academy_courses ac
SET estimated_minutes = v.total_lesson_minutes
FROM public.v_academy_course_total_minutes v
WHERE ac.id = v.course_id
  AND ac.estimated_minutes IS NULL
  AND v.total_lesson_minutes > 0;
