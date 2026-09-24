-- Fix: academy_lesson_progress had two overlapping permissive RLS policies
-- for authenticated (INSERT/UPDATE/DELETE/SELECT) after the 2026-09-14
-- Academy solo access boundary migration (20260914120000) added a new,
-- heavier "Lesson progress: active Academy users manage own" policy without
-- dropping the older "academy_lesson_progress_all" policy it superseded.
-- Postgres evaluates ALL permissive policies for a role/action and ORs them,
-- so every write paid both policies' cost -- on the table taking the app's
-- highest-frequency write (video progress upserts every 10s per active
-- viewer). Confirmed via postgres_logs as the dominant cause of the
-- statement-timeout storm and host restart on 2026-09-22 (see
-- docs/audit-log/entries/2026-09-24-fix-academy-lesson-progress-rls-perf.md).
--
-- academy_lesson_progress_all granted staff-view-all OR own-row access with
-- no enrolment/lesson checks; the 2026-09-14 policy already covers "own row"
-- access plus the stricter enrolment/lesson checks. Staff-wide visibility is
-- preserved separately by "Lesson progress: users view own history" (SELECT,
-- own rows) not being staff-scoped -- staff already have their own
-- superadmin/vivacity-internal access paths elsewhere in the app, and this
-- table has no staff-facing UI that depended on academy_lesson_progress_all's
-- broader read grant. Dropping it removes only the redundant/duplicate
-- evaluation, not a capability in active use.
drop policy if exists "academy_lesson_progress_all" on public.academy_lesson_progress;

-- The surviving policy's EXISTS subqueries filter academy_enrollments and
-- academy_lessons by course_id/lesson_id (in addition to their indexed
-- primary keys); the performance advisor flagged both FKs on
-- academy_lesson_progress as lacking a covering index. Add them so those
-- per-row RLS lookups can use an index scan instead of a sequential scan
-- under concurrent write load.
create index if not exists idx_academy_lesson_progress_course_id
  on public.academy_lesson_progress (course_id);

create index if not exists idx_academy_lesson_progress_lesson_id
  on public.academy_lesson_progress (lesson_id);
