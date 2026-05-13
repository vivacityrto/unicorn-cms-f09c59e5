## P1-b Batch A1 — RLS auth.uid() Subquery Optimization

Mechanical performance-only migration. Replaces bare `auth.uid()` with `(SELECT auth.uid())` in RLS policy USING/WITH CHECK expressions. Covers `academy_*`, `accountability_*`, and `active_timers`. No access-rule changes.

### Scope
~39 policies across 11 tables:
- `academy_assessment_attempts` (2), `academy_assessment_questions` (2), `academy_assessments` (1)
- `academy_certificates` (3), `academy_courses` (1), `academy_enrollments` (4)
- `academy_lesson_progress` (2), `academy_lessons` (1), `academy_modules` (1)
- `academy_package_course_rules` (2)
- `accountability_chart_versions` (3), `accountability_charts` (3)
- `accountability_functions` (3), `accountability_seat_assignments` (3)
- `accountability_seat_roles` (3), `accountability_seats` (3)
- `active_timers` (2)

### Execution
Single migration applying the SQL exactly as supplied.
