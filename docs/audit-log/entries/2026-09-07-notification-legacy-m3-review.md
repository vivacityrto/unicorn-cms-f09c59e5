# Notification legacy dependency review

**Date:** 2026-09-07

**Packet:** M3 investigation

**Scope:** read-only production dependency, security, and retention review

**Hosted state changed:** no

## Findings

Production contains zero rows in both `notification_schedule` and
`notification_audit_log`. Both tables have RLS enabled, no triggers, and no
dependent views. The three legacy audit routines are executable only by
`service_role`/`postgres`; `anon` and `authenticated` cannot execute them.

The three routines have no active cron schedule after M2 and no repository
caller. They are therefore safe candidates for a separately authorized
function-drop migration:

- `public.audit_flag_overdue_chcs()` — fails against the removed
  `notification_schedule.payload` column;
- `public.audit_send_24hr_confirmation()` — sends through the obsolete audit
  path and then writes the removed `payload` column; and
- `public.audit_send_evidence_reminders()` — uses the stale
  `evidence_requests.status = 'sent'` filter and sends directly through the
  legacy email path.

`notification_audit_log` is not dead. The active
`process-notification-outbox` Edge Function writes both success and failure
delivery records to it. Its current row count is zero because the production
outbox currently contains only terminal `failed` (738) and `skipped` (242)
rows, but the table remains part of the live worker contract and is retained.

`notification_schedule` is dormant but not yet removable. The deployed,
unscheduled `process-notification-queue` worker reads it, and
`send-automated-email` writes it in three audit-only branches. Neither path has
a repository caller, and all three branches reference the removed `payload`
column. Those code paths must be retired first; dropping the table now would
leave a deployed worker and email function pointing at a missing relation.

## Recommendation

Use the staged retirement path:

1. M3-A: drop only the three legacy database routines after a fresh preflight;
2. M3-B: remove the unreachable audit branches and retire the dormant queue
   worker through a separately reviewed Edge change; and
3. M3-C: after a quiet-period proof, drop `notification_schedule` only in a
   separately authorized migration.

Retain `notification_audit_log` (M3-D) and make its retention/observability
policy a later decision. No production migration was applied during this
review.

## Evidence queries

- `notification_schedule`: 0 rows; RLS enabled; no triggers/views.
- `notification_audit_log`: 0 rows; RLS enabled; no triggers/views.
- Legacy routines: `service_role`/`postgres` execute only; no anon or
  authenticated execute.
- Active cron inventory: jobs 4–6 absent after M2; no job targets
  `process-notification-queue`.
- Current outbox: 738 `failed` rows and 242 `skipped` rows; no `sent` rows.
