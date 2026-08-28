# Audit: 2026-08-28 — expose lesson outline to non-enrolled users safely

**Trigger:** ad-hoc (follow-up to the `academy_courses.estimated_minutes`
backfill session — Carl noticed the Course Outline on a real published
course showed "0 lessons" for a non-enrolled test user)
**Scope:** `academy_lessons` read access for pre-enrollment browsing only.
Did not touch the `academy_lessons` base-table RLS policies, or any
content-level access path (video_id/resource_id/content_markdown remain
gated exactly as before).

## Findings
- `v_academy_lesson_outline` (`SELECT ... FROM academy_lessons WHERE
  is_published = true`) was built specifically to be a "structure only"
  view — its column list deliberately excludes `video_id`, `resource_id`,
  and `content_markdown` — for exactly this pre-enrollment browsing use
  case. But it's a plain view, so it still inherits `academy_lessons`' RLS
  at query time (confirmed empirically: `set local role authenticated; set
  local request.jwt.claims ...` impersonating a real, non-enrolled client
  and querying the view returned 0 rows for a published course with 5
  published, non-preview lessons — the same result the app rendered).
- `academy_lessons_select`'s policy only exposes non-preview lessons to
  staff or users with an active/completed enrollment in that course — so
  every non-enrolled visitor saw an empty outline (and "0 lessons" /
  missing lesson counts on catalog cards, since `useAcademyCourses.ts` reads
  the same view for catalog lesson counts across course lists).
- `academy_modules` already has a simpler, unconditional `is_published =
  true` SELECT policy (no enrollment check) — module titles were always
  visible pre-enrollment, just not their lessons. The frontend's own
  Course Outline UI (lock icon per unenrolled lesson, `Lock` component in
  `AcademyCourseDetailPage.tsx`) clearly expects lesson titles to render
  pre-enrollment too, just non-clickable — confirming this was a gap
  against the frontend's own intent, not deliberate lesson-list-hiding.
- Widening the RLS policy itself was ruled out: RLS is row-level, so a
  second permissive policy broad enough to show lesson titles pre-enrollment
  would also let any authenticated user select that same row's
  `video_id`/`content_markdown` columns, since `academy_lessons` grants are
  table-wide, not per-column.

## Code changes (if this entry accompanies one)
- Migration `get_academy_course_lesson_outline_safe`: a `SECURITY DEFINER`
  SQL function (mirrors the existing `get_academy_facilitator_names_safe`
  pattern exactly — same `STABLE SECURITY DEFINER SET search_path TO
  'public'` shape) that returns only the safe structural columns
  (id/module_id/course_id/title/description/lesson_type/sort_order/
  is_published/is_preview/estimated_minutes) for lessons whose lesson,
  module, AND parent course are all published — the course-status join is
  new (the old view only checked lesson.is_published), added as defense in
  depth. `GRANT EXECUTE ... TO authenticated` only.
- Verified live: same `set local role authenticated` impersonation now
  returns all 5 lessons; a real published/unpublished-course spot check
  (draft course ids) returns zero rows as expected.
- Swapped all three `v_academy_lesson_outline` callers to the new RPC:
  `useAcademyModulesLessons.ts` (course outline + lesson viewer's shared
  hook), `useAcademyCourses.ts` (catalog lesson counts), and
  `AcademyLessonViewerPage.tsx` (lesson sidebar navigation). Left
  `v_academy_lesson_outline` itself in place, unchanged — nothing else
  references it.
- `AcademyCourseDetailPage.tsx`: also set the Course Outline accordion to
  `defaultValue` = all module ids, so the (now populated) lesson list is
  expanded by default instead of requiring a click to reveal it.
- Regenerated `src/integrations/supabase/types.ts` for the new RPC's types
  (clean diff — only the new function entry added).

## Decisions
- A `SECURITY DEFINER` function, not a relaxed/second RLS policy — the
  narrow, explicitly column-limited function is the only way to widen row
  visibility without also widening column-level (content) access, given
  `academy_lessons` uses table-wide grants rather than per-column ones.
- Added the parent-course `status = 'published'` check to the new
  function even though the old view never had it, since the function is now
  reachable without any staff/enrollment/preview gate — worth the extra
  join for defense in depth against a lesson accidentally left published
  under a draft/archived course.

## Open questions parked
- None.
