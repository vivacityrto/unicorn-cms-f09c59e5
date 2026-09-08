# `notification_schedule` quiet-period checkpoint (M3-C)

- **Date:** 2026-09-08
- **Author:** Codex
- **Status:** M3-B parity confirmed; M3-C quiet period in progress
- **Scope:** read-only production and repository cross-check; no hosted state changed

## Cross-check

M3-B was already implemented, merged, and deployed. Production currently lists
both target Edge Functions at version 175:

- `process-notification-queue`: credential-free `FUNCTION_RETIRED` HTTP 410
  stub; no `notification_schedule` or service-role-key reference.
- `send-automated-email`: retains the three email response paths but has no
  `notification_schedule` writer.

The latest observed deployment timestamp is `2026-09-07T23:57:35Z`. No queue
or automated-email Edge log events were observed after that deployment through
the read-only check at `2026-09-08T02:56:42Z`.

## M3-C gate state

The production table remains present with **0 rows**, six indexes, four RLS
policies, and no triggers. Database-function, view, and cron scans returned
zero references to the table. The conservative 24-hour quiet-period window
therefore completes at `2026-09-08T23:57:35Z`. Only after a fresh post-window
no-reference/no-access check and separate authorization may the reversible
table-drop migration remove `notification_schedule`, its indexes, and its
policies. `notification_audit_log` and `notification_outbox` remain in scope
and must not be changed by M3-C.
