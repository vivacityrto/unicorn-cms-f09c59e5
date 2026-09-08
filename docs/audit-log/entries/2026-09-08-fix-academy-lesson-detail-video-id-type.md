# Fix fn_academy_enrollment_lesson_detail's video_id return type

**Date:** 2026-09-08

**Packet:** Phase 2.6 stabilization Packet P4-D, L10 item #16

**Scope:** one production Postgres function (drop + recreate for a return-type change)

**Hosted state changed:** yes — function definition only, no data touched

## Decision

Carl explicitly authorized this fix while continuing the P4-D queue.
Unlike the other P4-D items, this one had no design ambiguity — it's a
single, mechanical type mismatch, already root-caused in the L10 register:

`fn_academy_enrollment_lesson_detail`'s own `RETURNS TABLE` declared
column 9 (`video_id`) as `text`, but `academy_lessons.video_id` is
genuinely `uuid`. Every call has always errored with `42804: returned
type uuid does not match expected type text in column 9`, so the
Enrolment Progress drawer's Lessons section always fell back to its
empty state ("No lessons published in this course") regardless of real
course/enrolment content — confirmed live on a real enrolment showing
"3/5 lessons complete" in its own progress bar while the Lessons section
directly below it claimed zero.

Confirmed via `information_schema.columns` against every other selected
column before writing the fix — `video_id` is the only mismatch; the
other 15 columns' declared types already match their source columns
(`academy_modules`, `training_videos`, `academy_lesson_progress`) exactly.

## Implementation

`supabase/migrations/20260908040000_fix_academy_lesson_detail_video_id_type.sql`:

- `DROP FUNCTION` first, then `CREATE FUNCTION` with `video_id` corrected
  to `uuid` — `CREATE OR REPLACE FUNCTION` cannot change a function's
  return type (including a single column's type inside `RETURNS TABLE`),
  per this repo's own guardrail for function signature/return-type
  changes.
- Re-granted `EXECUTE` to `service_role`/`authenticated`/`postgres` —
  the exact three roles confirmed via
  `information_schema.routine_privileges` before the drop — since
  `DROP FUNCTION` removes all grants on the object.
- The function body itself is otherwise byte-identical to the original;
  no logic changed.

No `migration-safety-allowlist.json` entry needed — pure DDL, no
risk-category match in `audit-migrations.mjs`.

No frontend code change was needed or made: `useLessonDetail`/
`useAcademyEnrollments.ts` already consume the RPC's JSON response
generically (a UUID serializes as a JSON string either way), and the
hook was previously observed to silently return `[]` on any RPC error —
it will now receive real data instead.

## Postflight

- `pg_get_function_identity_arguments` returns exactly one row for
  `fn_academy_enrollment_lesson_detail` (confirms no duplicate overload
  from the drop/create).
- Extracted the function body's `RETURN QUERY` SELECT and ran it
  directly against a real enrolment (`academy_enrollments.id = 1`,
  `course_id = 17`): returned real lesson rows with correctly-typed
  `video_id` UUIDs (e.g. `46de4b2e-55bf-439b-9691-4f7417aec606`) and
  correct `video_duration_seconds`/`is_completed`/etc. — no error.
- Calling the function itself (`select * from
  fn_academy_enrollment_lesson_detail(1)`) now fails only at its own
  `is_vivacity()` staff-only auth check (`P0001: Forbidden: staff only`)
  — confirming the fix resolved the type-check failure that used to
  occur first, and the function's existing security gate is unaffected.
- No rows in any table were touched — this is a function-definition-only
  change.

## Open questions parked

- L10 items #10, #14, #15, #18 remain in the P4-D queue, each still
  needing its own design decision before a fix — not touched here.
