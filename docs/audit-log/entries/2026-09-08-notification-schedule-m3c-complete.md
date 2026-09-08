# `notification_schedule` retirement (M3-C)

- **Date:** 2026-09-08
- **Author:** Codex
- **Status:** completed
- **Scope:** explicitly authorized production schema retirement; no application rows were deleted

## Change

Applied the fail-closed `retire_notification_schedule` migration to production
after the final dependency check. Supabase recorded the migration as
`20260908031729`. The migration refused to proceed if rows, external foreign
keys, triggers, database-function references, view references, or cron
references had reappeared.

## Postflight

- `public.notification_schedule`: absent (it contained 0 rows before removal).
- `public.notification_audit_log`: present and unchanged.
- `public.notification_outbox`: present and unchanged.
- Database function references: 0.
- View references: 0.
- Cron references: 0.

The repository includes a schema-only rollback script for the empty legacy
contract. It intentionally does not recreate the retired audit routines or
queue worker.
