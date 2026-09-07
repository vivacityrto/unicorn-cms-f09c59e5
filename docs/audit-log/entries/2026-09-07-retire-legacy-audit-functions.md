# Retire legacy audit notification functions

**Date:** 2026-09-07

**Packet:** M3-A

**Scope:** production migration and postflight verification

**Hosted state changed:** yes — database routines only

## Change

Applied `supabase/migrations/20260907130000_retire_legacy_audit_functions.sql`
to production after the M3 dependency review and explicit approval. The
migration dropped only:

- `public.audit_flag_overdue_chcs()`;
- `public.audit_send_24hr_confirmation()`; and
- `public.audit_send_evidence_reminders()`.

These routines were service-role-only, unscheduled after M2, had no trigger or
view dependency, and had no repository caller. They referenced the removed
`notification_schedule.payload` contract and were not viable notification
paths.

## Postflight

- All three routines are absent from `pg_proc`.
- Jobs 4–6 remain absent from `cron.job`.
- `notification_schedule` remains present, RLS-enabled, and empty.
- `notification_audit_log` remains present, RLS-enabled, and empty.
- `notification_outbox` is unchanged at 738 `failed` and 242 `skipped` rows.
- Supabase migration history records
  `20260907052028 / retire_legacy_audit_functions`.

M3-B remains open to retire the dormant Edge references before considering a
future `notification_schedule` table drop. `notification_audit_log` remains
part of the active outbox worker contract.
