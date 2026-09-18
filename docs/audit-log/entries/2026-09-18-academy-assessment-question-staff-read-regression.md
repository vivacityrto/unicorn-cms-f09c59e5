# Academy assessment question staff-read regression

- **Date:** 2026-09-18
- **Author:** Codex
- **Status:** Fix prepared; merge and hosted migration application pending
- **Scope:** Academy Builder assessment-question visibility
- **Related workstream:** Academy Solo MVP Phase 1

## Finding

The Academy Solo access-boundary migration removed the former combined
`Questions: staff or enrolled learners view` policy and recreated only an
enrolment-gated learner `SELECT` policy. The migration comment assumed the
existing staff manage policies would preserve staff access, but the builder
reads `academy_assessment_questions` directly and write policies do not grant
read access.

The result was a silent empty result under RLS: staff saw `Questions (0)` in
the course builder even though the reported course's assessment had 48 rows
in production.

## Correction

Migration `20260918053250_academy_assessment_questions_staff_select.sql`
adds a separate authenticated staff `SELECT` policy using the existing
Super Admin/admin/internal-staff predicate. The learner policy remains
restricted to users with current Academy access and an active/completed
enrolment.

## Why it escaped

The Academy Solo contract tests asserted the new entitlement and learner
boundary but did not assert that staff could still read questions. No
authenticated staff builder read test covered the direct Data API query, and
RLS returned zero rows rather than an error. The corrective contract test
asserts both the staff and learner paths.

## Verification

- Live production inspection confirmed the assessment rows existed and the
  pre-fix policy set lacked a staff `SELECT` policy.
- The focused Academy Solo RLS contract suite passes with the new staff-path
  assertion.
- The full repository verification chain and an authenticated staff builder
  check are recorded in the pull request and post-merge verification.
