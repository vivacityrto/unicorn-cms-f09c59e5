# Audit: 2026-08-11 - academy-certificate-quiz-completion

**Trigger:** drift-surfaced / ad-hoc
**Scope:** Vivacity Academy course completion, required-assessment access, and automatic certificate issuance. Did not issue or backfill any production certificates in this PR.

## Findings
- Tiziana Russo's enrollment for "Understanding the RTO Credential Policy Landscape" was completed at 100% lesson progress with certificates enabled, but no certificate existed.
- The course has a published required certificate assessment, and Tiziana had no passing assessment attempt, so the certificate trigger correctly held issuance.
- The frontend hid assessment entry points once an enrollment reached `completed`, leaving learners in a confusing 100%-complete/no-certificate state with no obvious path to the quiz.
- Production `complete_academy_enrollment` still checked `academy_lesson_progress.status = 'completed'`, but production progress rows use `is_completed`; the newer progress trigger had completed the enrollment despite that RPC drift.
- Passing a required assessment after lesson completion did not re-fire certificate issuance because the certificate trigger only ran on enrollment status transitions to `completed`.

## KB changes shipped
- No changes.

## Code changes (if this entry accompanies one)
- Pending commit: show assessment access for completed-but-uncertified enrollments, allow assessment submission against completed enrollments, correct course-complete certificate messaging, and centralise automatic certificate issuance so both completion and assessment pass paths can issue idempotently.

## Decisions
- Keep certificate issuance gated by required published assessments.
- Do not auto-issue a certificate for Tiziana as part of this PR; she still needs to pass the required quiz unless Carl separately asks for an admin/manual remediation.

## Open questions parked
- Whether old completed-but-uncertified enrollments with no assessment attempt should get a staff-facing remediation report.
