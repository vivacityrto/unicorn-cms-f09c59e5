-- The client-facing course outline (and catalog lesson counts) queried
-- v_academy_lesson_outline directly, which inherits academy_lessons' RLS —
-- and academy_lessons_select only exposes non-preview lessons to staff or
-- users already enrolled in that course. Confirmed live (impersonating a
-- real, non-enrolled client via `set local role authenticated; set local
-- request.jwt.claims ...`) that a published course with 5 published,
-- non-preview lessons returns zero rows through the view for a non-enrolled
-- user — the frontend renders "0 lessons" / an empty outline even though
-- the whole point of that view (per its own column list — no video_id,
-- resource_id, or content_markdown) was to be a safe, structure-only list
-- for pre-enrollment browsing. academy_modules already has a simpler
-- `is_published = true` (no enrollment check) SELECT policy, so this brings
-- lesson *titles* in line with that same precedent — only the actual
-- content columns (video_id/resource_id/content_markdown, still only
-- selectable via the unchanged base-table RLS) remain enrollment-gated.
--
-- SECURITY DEFINER function, not a relaxed RLS policy: Postgres RLS is
-- row-level, so a second permissive policy broad enough to show lesson
-- titles pre-enrollment would also let any authenticated row-match select
-- the same row's video_id/content_markdown columns, since existing table
-- grants are table-wide, not per-column. Mirrors the existing
-- get_academy_facilitator_names_safe pattern: a narrow, explicitly
-- column-limited SECURITY DEFINER function is the safe way to expose a
-- "public" slice of a table an RLS policy otherwise protects.
CREATE OR REPLACE FUNCTION public.get_academy_course_lesson_outline_safe(p_course_ids bigint[])
RETURNS TABLE (
  id bigint,
  module_id bigint,
  course_id bigint,
  title text,
  description text,
  lesson_type text,
  sort_order integer,
  is_published boolean,
  is_preview boolean,
  estimated_minutes integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT l.id, l.module_id, l.course_id, l.title, l.description, l.lesson_type,
         l.sort_order, l.is_published, l.is_preview, l.estimated_minutes
  FROM academy_lessons l
  JOIN academy_modules m ON m.id = l.module_id
  JOIN academy_courses c ON c.id = l.course_id
  WHERE l.course_id = ANY(p_course_ids)
    AND l.is_published = true
    AND m.is_published = true
    AND c.status = 'published';
$$;

GRANT EXECUTE ON FUNCTION public.get_academy_course_lesson_outline_safe(bigint[]) TO authenticated;
