# Audit: 2026-11-17 — notification-message-routing

**Trigger:** ad-hoc. Rollout step 2 of the notification redesign ([design doc](../../kb/reference/notification-redesign-2026-11-17.md)): swap client-message routing to the owner-only resolver, with a shadow period and the 4-working-hour escalation.
**Scope:** one migration that replaces `fn_tm_on_message_insert()`, adds a shadow trigger, a settings table, a shadow log, an escalation table and function, and an escalation job. Requires the step 1 foundation ([entry](2026-11-17-notification-routing-foundation.md)).
**Status:** applied to `unicorn-qa` and proven. **Not applied to production**; that and each mode change need Carl's explicit go-ahead (see "Production steps").

## What changed

**Migration `supabase/migrations/20261117150000_notification_message_routing.sql`** (rollback in `supabase/migrations/rollback/20261117150000_notification_message_routing.down.sql`, which restores the live function text):

- **Inert on apply.** `notification_routing_settings` is seeded `message_routing_mode = legacy`, `escalation_enabled = false`, `escalation_hours = 4`. In `legacy` mode the replaced trigger function behaves exactly as the live one (migration `20260703061102`): every client-sent message notifies all active internal staff. Only addition: each notification carries `metadata.routing_reason`.
- **`shadow` mode:** legacy behaviour, plus `trg_tm_zz_routing_shadow` (fires after `trg_tm_on_message_insert`, by trigger name order) writes one `notification_routing_shadow_log` row per person: notified by legacy, would be notified by the resolver, and the resolver's reason.
- **`resolver` mode:** client-sent messages notify the resolver's recipients only (primary CSC, delegates, opted-in or watching staff, or Super Admins when the tenant has no active primary CSC). Tenant participants (the client side) are unchanged in every mode.
- **Escalation:** `escalate_unread_client_messages()` finds client messages whose owner notifications (`primary_csc` or `delegate`) are all unread after `escalation_hours` of the primary CSC's own working time (`notification_working_seconds`: `users.timezone`, `working_days`, `working_hours`; blank falls back to Sydney, Monday to Friday, 09:00 to 17:00) and notifies Super Admins who were not already told, once (`notification_escalations`). It does nothing unless `escalation_enabled = 'true'`. A `pg_cron` job runs it every 15 minutes (created only where `pg_cron` exists).
- Settings, shadow log and escalation tables: RLS on, Super Admin read only, no write grant (changes are audited SQL). All functions `SECURITY DEFINER` with `SET search_path TO ''`, `service_role` only.

**Safety allowlist:** two entries in `supabase/migration-safety-allowlist.json` (migration and rollback; expire 17 December 2026). The flagged lines are the settings seed, the unchanged INSERT and UPDATE inside the replaced function, the writes inside the shadow and escalation functions, and the cron job; no row in an existing table is written on apply.

## Evidence

- `node scripts/audit-migrations.mjs --changed-only --base-ref <step 1 branch>`: all findings allowlisted, exit 0.
- **`unicorn-qa` (project `qfpxvumcrnzrjyvqkicq`, confirmed before each write).** Migration applied through the Supabase MCP; `supabase/qa-checks/notification_message_routing_tests.sql`: **31 checks, all passing, rolled back** (settings back to the seeded defaults and no leftover rows afterwards). They cover: seeds inert; `legacy` mode still notifies all 5 active internal staff (and skips the disabled account) and a staff-sent message notifies no staff; `shadow` mode keeps the legacy notifications and logs 1 agreement and 4 legacy-only rows, with the reason, ignoring staff-sent messages; `resolver` mode notifies only the primary CSC, sends an unassigned tenant to Super Admins only, and still notifies no staff for a staff-sent message; working-time maths (Friday 4 pm to Monday 10 am is 2 hours, a weekend is 0, within a day, reversed range, blank-profile fallback); escalation off by default, an overdue unread message escalates once to the Super Admin and a fresh one does not, a read owner notification stops it, legacy-mode notifications are never escalated; staff cannot run the job, read or write the settings; Super Admin can read but not write the settings; `anon` cannot read the log; invalid mode and escalation window are rejected.
- **Not proven on QA:** the `pg_cron` job (not installed there), behaviour at production volume, and real CSC assignments (QA has two).
- **Production preflight (read-only, 17 November 2026, ref `yxkgdalkbrriasiyyrwk`):** none of the nine new tables or eight new functions exist; `pg_cron` is installed with no `notification-` jobs; the helper functions exist; the live `fn_tm_on_message_insert` has md5 `f18ffa14c565d4d73ec93cb3d9050d03` (recorded so the rollback target can be checked).

## Production steps (not done)

Order matters; each numbered step needs Carl's go-ahead.

1. Apply step 1 (foundation), then its seeds: AJ and Ezel as `all_csc` delegates, exempt rows for the test and duplicate accounts.
2. Apply this migration unchanged. Inert: mode `legacy`, escalation off.
3. **Shadow period:** set `message_routing_mode = 'shadow'` with an audited `UPDATE`. Compare `notification_routing_shadow_log` over a few working days (who legacy notified that the resolver would not, and any resolver-only recipient). Expected: one agreement per client-sent message for tenants with an active primary CSC, and Super Admins only for tenants without one.
4. **Cutover:** set `message_routing_mode = 'resolver'` and `escalation_enabled = 'true'`; re-run the inbox cleanup (see [the cleanup entry](2026-11-17-notification-inbox-cleanup.md)) so inboxes start clean.
5. Read-only postflight: unread message counts per staff member against the design; one escalation test.

## Rollback

Set `message_routing_mode = 'legacy'` (instant, no deploy) and `escalation_enabled = 'false'` to return to today's behaviour; or run `supabase/migrations/rollback/20261117150000_notification_message_routing.down.sql`, which restores the live function and drops everything this migration added. Notifications already written keep their rows.

## Decisions

- A settings switch rather than a code deploy, so cutover and rollback are one audited statement each.
- Shadow mode compares real traffic before any inbox changes.
- Escalation clock uses the primary CSC's own calendar, and stops when any owner reads the message (decision 4).
- Escalated notifications reuse `type = 'message'` with `routing_reason = 'escalation'`, so the existing bell shows them with no UI change.

## Open questions parked

- The bell UI, preference matrix and delegate management screens (rollout step 3) and moving tickets, notes and tasks to the resolver (step 4).
- Shadow-log retention (no job yet; the log is small, one row per person per client message while in shadow mode).
