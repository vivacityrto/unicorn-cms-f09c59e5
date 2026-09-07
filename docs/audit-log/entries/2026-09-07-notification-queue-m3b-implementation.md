# Notification queue retirement implementation (M3-B)

- **Date:** 2026-09-07
- **Author:** Codex
- **Status:** implementation prepared; production deployment pending reviewed PR merge
- **Scope:** Edge Function source/config/tests only; no database migration or data change

## Change

Removed the three dormant `notification_schedule` insert branches from
`send-automated-email` while preserving its `audit_24hr_confirmation`,
`audit_evidence_reminder`, and `audit_docs_ready` response paths. Replaced the
unused `process-notification-queue` worker with a credential-free HTTP 410
`FUNCTION_RETIRED` stub so stale invocations fail visibly. The active
`process-notification-outbox` worker and both notification tables were not
changed.

## Evidence

- Repository reachability review found no frontend or Edge caller for
  `process-notification-queue`; its cron job was already retired in M2.
- Targeted cron-auth and M3-B retirement tests passed: **13/13**. Lint
  ratchet, typecheck, frontend tests, Edge tests, build, and KB-link checks
  also passed. Playwright was not run because this packet changes no UI route
  and port 8080 was owned by another active Claude worktree.
- Production deployment is intentionally pending reviewed PR merge. The
  project’s native Supabase GitHub sync is expected to deploy the two changed
  functions after merge; post-merge version/source and read-only health checks
  are required before M3-C.

## Follow-up

Keep `notification_schedule` intact until M3-C proves no deployed function,
migration, trigger, view, or frontend caller references it and a quiet-period
review authorizes a separate reversible migration. Retain and govern
`notification_audit_log` under M3-D because the active outbox worker writes it.
