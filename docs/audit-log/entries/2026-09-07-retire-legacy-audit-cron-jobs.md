# Retire legacy audit cron jobs

**Date:** 2026-09-07

**Packet:** M2

**Scope:** repository migration authoring, production application, and postflight

**Hosted state changed:** yes — schedules only

## Decision

The product owner approved retirement of the three legacy audit-reminder cron
jobs:

- `audit-24hr-confirmation` (job 4)
- `audit-evidence-reminders` (job 5)
- `audit-flag-overdue-chcs` (job 6)

Job 6 has a live failure because its function inserts into the removed
`notification_schedule.payload` column. Jobs 4 and 5 report successful SQL
invocations, but that does not prove an email was delivered; both depend on
obsolete contracts.

## Dependency boundary

The preflight found that `notification_schedule` is still used by the current
`process-notification-queue` Edge Function and `send-automated-email`, while
`process-notification-outbox` writes `notification_audit_log`. M2 therefore
does not drop either table or any helper function. Those objects remain for a
separate M3 dependency and retention decision.

## Implementation

`supabase/migrations/20260907120000_retire_legacy_audit_cron_jobs.sql`:

- no-ops when `pg_cron` is unavailable;
- refuses to act if historical job IDs 4–6 have been reused by another job;
- unschedules only the three approved job names; and
- raises if any of those names remain after unscheduling.

The migration was allowlisted for the production project reference with a
short expiry because it intentionally changes hosted scheduling. It was
applied after explicit authorization. Postflight confirmed zero rows for jobs
4–6, 24 active jobs remain, neighboring schedules are unchanged, and the
migration is recorded in Supabase history as
`20260907050651 / retire_legacy_audit_cron_jobs`. Historical
`cron.job_run_details` rows remain; no notification tables or helper functions
were changed.
