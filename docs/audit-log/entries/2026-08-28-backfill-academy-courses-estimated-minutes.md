# Audit: 2026-08-28 — backfill academy_courses.estimated_minutes

**Trigger:** ad-hoc (Carl noticed "—" for duration on a published course's
detail page and asked whether the Vimeo duration backfill feature works)
**Scope:** `academy_courses.estimated_minutes` only. Did not touch
`training_videos.duration_seconds` (already fully populated) or add any new
sync mechanism.

## Findings
- `backfill-vimeo-durations` (hardened per
  `docs/audit-log/entries/2026-08-17-retire-vimeo-duration-backfill.md`) backfills
  `training_videos.duration_seconds` — confirmed all 773 rows already have a
  non-null value, so that feature has already done its job and is not the gap.
- The actual "—" is `academy_courses.estimated_minutes`, a separate column the
  Academy Builder's Structure tab already treats as a **manually-confirmed**
  value: it shows an auto-calculated total from `v_academy_course_total_minutes`
  (sum of the course's `academy_lessons.estimated_minutes`, unfiltered by
  publish status) alongside a "Use this value" button, rather than syncing it
  automatically. That's a deliberate design (a course owner might want a
  number that differs from the raw lesson sum), so this session didn't add a
  trigger to force-sync it going forward — only backfilled existing nulls.
- 66 courses (60 of them `status = 'published'`) had `estimated_minutes = NULL`
  despite every one of their lessons already carrying a valid
  `estimated_minutes` — the rollup had simply never been computed/confirmed
  for them, most likely because the Add Course / showcase-import flows never
  set this column at all (confirmed via grep: no write to
  `academy_courses.estimated_minutes` anywhere in
  `AcademyAddCoursePage.tsx`).
- Also noticed (not fixed, flagged separately to Carl): the client-facing
  Course Outline shows "0 lessons" for non-enrolled users on courses whose
  lessons aren't flagged `is_preview` — an RLS/RLS-view interaction, not a
  duration issue. Tracked as a separate follow-up, not part of this entry's
  scope.

## Code changes (if this entry accompanies one)
- Migration `backfill_academy_courses_estimated_minutes`: one-time
  `UPDATE ... FROM v_academy_course_total_minutes` — only touches rows where
  `estimated_minutes IS NULL` and the computed total is `> 0`, so it never
  overwrites an existing value and leaves genuinely lesson-less courses as
  `NULL` (renders identically to `0` client-side either way). Applied live via
  the Supabase MCP `apply_migration` tool. Verified 0 published courses left
  with a null `estimated_minutes` afterward.
- `AcademyCourseCleanupPage.tsx`: added a fourth "Missing duration" filter
  chip/column (same pattern as the existing facilitator/delivery-date/
  description ones) so a future course that slips through without a duration
  is easy to spot — no inline auto-fix action added here, since the existing
  "Builder" link in each row's Actions already opens the Structure tab where
  the "Use this value" control lives.

## Decisions
- Did not add a DB trigger to keep `estimated_minutes` continuously in sync
  with lesson totals — the Builder UI's existing manual-confirm pattern
  ("Use this value") is treated as the intended source of truth for this
  column, and a hard trigger would silently overwrite any course where staff
  deliberately chose a different number.

## Open questions parked
- The "0 lessons" / empty Course Outline for non-enrolled users (see
  Findings) — worth its own audit entry if/when addressed.
