# Audit: 2026-08-27 — widen academy_courses.webinar_series check constraint

**Trigger:** drift-surfaced (found while Playwright-verifying the new Add Course
showcase flow)
**Scope:** `academy_courses_webinar_series_check` and the frontend `SERIES`
list shared by Quick Add / Add Course. Did not touch any other Academy
constraint or table.

## Findings
- The frontend `SERIES` constant (`src/pages/superadmin/AcademyAddCoursePage.tsx`,
  previously `AcademyQuickAddPage.tsx`) offers 8 selectable series: `AI in Your
  RTO`, `Inside VET`, `Trainers Edge`, `8 Critical Drivers to RTO Success`,
  `Superhero Tools Unleashed`, `The Compliance Lab`, `CRICOS`, `Courses`.
- `academy_courses_webinar_series_check` only allowlisted the first 6 —
  selecting `CRICOS` or `Courses` in either Quick Add or the new Add Course
  page always failed the course-save insert with a 400
  (`new row for relation "academy_courses" violates check constraint
  "academy_courses_webinar_series_check"`), silently, since the UI let you
  pick them with no upfront validation.
- Confirmed via `select distinct webinar_series, count(*) from
  academy_courses group by webinar_series` that no existing row ever used
  `CRICOS` or `Courses` — the constraint has been out of sync with the
  frontend since one of those two series was added to `SERIES` without a
  matching migration, not a recent regression.

## Code changes (if this entry accompanies one)
- Migration `widen_academy_courses_webinar_series_check`: dropped and
  recreated the check constraint to allowlist all 8 values used by the
  frontend `SERIES` list. Pure widen — no data touched, no existing row
  affected.

## Decisions
- Treated the frontend `SERIES` list as the source of truth (widen the DB to
  match the UI) rather than removing `CRICOS`/`Courses` from the frontend,
  since both are real RTO series options with their own `session_type`/access
  config already wired up — the DB constraint was the stale side.

## Open questions parked
- None.
