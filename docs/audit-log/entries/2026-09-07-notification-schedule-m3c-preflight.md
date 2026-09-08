# `notification_schedule` retirement preflight (M3-C)

- **Date:** 2026-09-07
- **Author:** Codex
- **Status:** preflight captured; production removal not authorized or applied
- **Scope:** read-only repository and production checks; no hosted state changed

## Evidence captured

- Merged `origin/main` contains no runtime/frontend caller for
  `notification_schedule`. Remaining repository matches are historical
  migrations, generated Supabase types, the retirement regression test, and
  the retained `process-notification-queue` config entry.
- Production `public.notification_schedule` still exists with **0 rows**, six
  indexes, four RLS policies, and no triggers. The live database function and
  view-definition scans returned no references to the table. The cron scan
  returned no job referencing the table or `process-notification-queue`.
- The 24-hour Edge log query found three requests to the queue endpoint, all
  served by the old version 170 with HTTP 401. These include the read-only
  probes used for this audit; the committed 410 stub is not live yet, so this
  is not a clean quiet-period baseline.

## Gate result

M3-C is **blocked pending M3-B deployment/source parity**. First observe the
410 `FUNCTION_RETIRED` response in production, then start the agreed
quiet-period window and repeat the no-caller/no-access checks. Only after that
evidence and explicit production authorization may a separate reversible
migration drop the table, indexes, and policies. `notification_audit_log` and
`notification_outbox` remain untouched.
