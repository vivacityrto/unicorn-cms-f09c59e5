# Audit: 2026-05-19 — Notification system survey

**Trigger:** Ad-hoc, post-fix exploration. Followed on from `audit/2026-05-19-academy-notification-leak-fix.md` (merged earlier today) with a request to map the whole notification system end-to-end and produce a prioritised list of what should be fixed next.
**Author:** Carl
**Scope:** Read-only. Surveyed `public.user_notifications`, `public.notification_outbox`, `public.notification_audit_log`, `public.notification_schedule`, `public.notification_rules`, `public.user_notification_prefs`, `public.user_notification_integrations`, `public.dd_notification_event`, `public.dd_notification_status`, every edge function under `supabase/functions/notify-*`, `send-*`, `process-*`, `generate-notifications`, every trigger writing to `user_notifications`, every direct-insert call site in `src/`, the three consumer hooks (`useNotifications`, `useClientNotifications`, `useTeamsNotifications`), and all rendered surfaces. Out of scope: implementing any of the fixes (deferred — see Decisions below). No DB changes. No code changes.

---

## Background

This morning's session fixed an academy-only user receiving a `suggestion_submitted` notification (audit `2026-05-19-academy-notification-leak-fix`). The fix surfaced enough of the notification system to make it clear the architecture deserved a fuller map before any further point fixes. This survey is that map.

---

## Findings

### Architecture

- **Two parallel write paths with no shared state.** `public.user_notifications` is the in-app bell table — read by the frontend via `postgres_changes` realtime. `public.notification_outbox` is an async delivery queue for Microsoft Teams + Mailgun email, drained every 5 min by the `process-notification-outbox` edge function (pg_cron job 10, added 2026-05-15). The two tables are not joined, no view UNIONs them, and a given event lands in zero, one, or both depending on which writer fired.
- **`notification_outbox` implements the Transactional Outbox pattern.** Triggers and `emit_notification()` write to outbox inside the same DB transaction as the source event — atomic with the source, deliverable asynchronously with retries (exponential backoff via `attempt_count` + `next_retry_at`). Status enum (`queued`/`sent`/`failed`/`skipped`) is now an FK to `dd_notification_status` (Phase 3B, 2026-05-15).
- **In-app channel doesn't need outbox semantics** because the DB itself is the delivery mechanism for `user_notifications` — INSERT and the bell sees it via realtime. Splitting in-app from outbox is defensible but the cost is no unified "everything Khian received" query.

### Tables

| Table | Status | Notes |
|---|---|---|
| `user_notifications` | Live | Today's RLS tighten landed; INSERT requires `user_id = auth.uid() OR is_super_admin_safe OR is_vivacity_team_safe`, `TO authenticated` |
| `notification_outbox` | Live | Status FK to `dd_notification_status`, dual partial indexes recreated 2026-05-15 (BUG-036 closure) |
| `notification_audit_log` | **Dead.** Defined `20260206071351_bbfe0506`, FK to `notification_outbox.id`, zero writers found. Scaffolding for an unfinished feature. |
| `notification_schedule` | **Legacy.** Still written by `audit_send_24hr_confirmation` (`audit_24hr_confirmation` rows) and `audit_flag_overdue_chcs` (`chc_overdue` rows). No frontend reads it. Retirable once audit reminders move to outbox. |
| `notification_rules` | Live | Teams-only. Per-event-type `is_enabled` + `quiet_hours_start/end` (columns set, **no UI sets quiet hours**). Wired to `NotificationRulesCard`. |
| `user_notification_prefs` | Live | In-app-only. JSONB `event_settings.categories.{tasks,meetings,obligations,events}`. No RLS — service-role cron consumer. UI: `NotificationPrefsTab`. |
| `user_notification_integrations` | Live | Per-user Teams connection. `ms_user_id`, `webhook_url`, `preferred_channel_id`. |
| `dd_notification_event` | Live | Dictionary; `is_active` flag honoured by `emit_notification()` since Phase 3A (2026-05-14). |
| `dd_notification_status` | Live | Dictionary post Phase 3B (2026-05-15). |

### Writers — every code path that creates a notification row

**Edge functions (6 confirmed):** `generate-notifications` (cron-driven; hourly meetings, daily tasks/obligations; respects `user_notification_prefs`; dedupe by `{type}:{record_id}:{window}[:user_id]`), `process-notification-outbox` (5-min cron; respects `notification_rules` + quiet hours), `notify-suggestion-submitted` (hardened today), `notify-merge-fields-updated` + `notify-action-shared` (new today, replace direct client-caller inserts), and `send-composed-email` / family (email-only, no row).

**DB triggers (6 confirmed):** `fn_notify_csc_on_support_ticket` (`help_threads` AFTER INSERT WHERE channel='support' → writes `support_ticket`), `fn_notify_conversation_participants` (`messages` AFTER INSERT), `fn_tm_on_message_insert` (`tenant_messages` AFTER INSERT), `fn_check_consultant_overload_alert` (`tenants` AFTER UPDATE; writes `capacity_alert` with `overload_{uuid}_{YYYY-MM-DD}` dedupe key), `fn_check_membership_usage_alerts` + `check_membership_utilisation_alerts` (`time_entries` AFTER INSERT; writes `utilisation_warning` with `utilisation_75/90_{tenant_id}_{YYYY-MM}` dedupe key).

**Direct authenticated-role inserts (4 surviving Phase 0.5):** `StageNotesTab.tsx:279` (also writes `follower` type via `toggleAssignee` at line 282), `EosQCSession.tsx:57`, `QCScheduler.tsx:110`, `noteNotifications.ts:123,167`. All pass the new RLS via `is_vivacity_team_safe`.

**Manually-invoked PL/pgSQL (2):** `audit_send_24hr_confirmation()`, `audit_send_evidence_reminders()`. **Neither is on pg_cron.** Designed for manual invocation but no UI or cron triggers them. Half-shipped.

### Readers

- `useNotifications` (`src/hooks/useNotifications.tsx`) — staff bar. Filters by `user_id = auth.uid()` only. Used by `TopBar` and (now-conditionally) `AcademyTopBar`. Has realtime subscription to `postgres_changes`.
- `useClientNotifications` — client portal. Filters by `user_id = profile.user_uuid AND tenant_id = activeTenantId AND type IN (client-facing types) AND !isAcademyOnly`.
- `useTeamsNotifications` — config UI for `notification_rules`, not a notification feed.

### Sanity check: is the write side tenant-correct?

Hypothesis (before checking): a multi-tenant staff user could see notifications from a tenant they're not assigned to — a cross-tenant leak. Initially scored as a P0 in the priority list.

Query: every `user_notifications` row with non-NULL `tenant_id` whose recipient is neither (a) a `tenant_users` member of that tenant, nor (b) an assigned consultant (`tenant_csc_assignments`), nor (c) a Vivacity team member (`unicorn_role IN ('Super Admin','Team Leader','Team Member')`).

Result: **11 rows out of all of `user_notifications`** (table has hundreds). Investigated:

- **10 of 11** are `meeting_upcoming` notifications for tenant 6372 ("Vivacity Coaching & Consulting" — Vivacity's own internal tenant), addressed to meeting participants who don't have a `tenant_users` row for that tenant. **False positives.** The `generate-notifications` cron writes `meeting_upcoming` based on `meeting_participants`, and stamps the notification with the meeting's tenant_id. Meeting participants don't need a `tenant_users` row for that tenant — they just need to be invited to the meeting. The hypothesis was wrong; the writer is correct.
- **1 of 11** is a `follower` row from 2025-12-18 for tenant 42 ("Sarina Russo Institute") where the recipient user record has been hard-deleted from `public.users` (email and `unicorn_role` both NULL). Not a leak; an orphan from a deleted user.

**Verdict: the write side is tenant-correct. The originally suspected `useNotifications` cross-tenant leak is not a real issue.** Staff seeing notifications across all tenants they're addressed to is by design — the bell renders `tenant_name` per row precisely for this multi-tenant workflow.

### Discoveries from the survey

- **Email provider is Mailgun.** Env vars: `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_REGION` (us/eu), `MAILGUN_FROM_EMAIL` (default `noreply@vivacity.com.au`). Eight edge functions call it: `send-composed-email`, `send-invitation-email`, `send-password-reset`, `send-self-password-reset`, `send-stage-email`, `send-staff-onboarding-email`, `bulk-send-invitations`, `resend-invite`. The function named `resend-invite` uses Mailgun — "resend" here means "send again", not the Resend SaaS.
- **All 12 notification type writers identified.** `note_shared`/`note_added` from `noteNotifications.ts`; `meeting_upcoming`/`task_due`/`obligation_due` from `generate-notifications`; `message` from `fn_notify_conversation_participants` / `fn_tm_on_message_insert`; `suggestion_submitted` from `notify-suggestion-submitted`; `support_ticket` from `fn_notify_csc_on_support_ticket`; `qc_scheduled`/`qc_reminder` from `QCScheduler.tsx`/`EosQCSession.tsx`; `capacity_alert` from `fn_check_consultant_overload_alert` + `auto_assign_consultant`; `follower` from `StageNotesTab.tsx:282`; `utilisation_warning` from `check_membership_utilisation_alerts`. None partially abandoned — every type has a live writer.
- **Three `@vivacity.com.au` staff (vanessa, bonnie, aj) have `unicorn_role = 'User'`** instead of `Team Member`/`Team Leader`/`Super Admin`. Surfaced by the sanity check (they appeared as suspicious because they don't satisfy `is_vivacity_team_safe()`). Notification-correct (they receive their own meeting reminders) but means they can't pass the new RLS for cross-user inserts. Worth verifying intent — either promote to team role or confirm they're meant to be external user accounts on a vivacity.com.au email.

---

## DB changes shipped

None. Read-only survey.

---

## Code changes shipped

None.

---

## KB changes shipped

None in `unicorn-kb/`. Two project-memory files saved to Claude's local memory store (informational, not part of the canonical KB):

- `tenant_csc_resolution.md` — `tenant_csc_assignments` is canonical for tenant→CSC; `clients_legacy.manager` is dead (0/407 tenants populated).
- `notification_architecture.md` — two-path model, three preferences surfaces, Mailgun, dead/legacy tables, `useNotifications` tenant-leak hypothesis disproved.

Both are AI-side-only memory. If any of this needs to live in the canonical KB, draft a `unicorn-kb/reference/` doc separately.

---

## Codebase observations (read-only)

- `unicorn-cms-f09c59e5 @ b11114ab06cf52974ab176b65d0104f7937cd92d`: origin/main SHA at survey time. Includes today's Lovable fixes from the morning session (audit `2026-05-19-academy-notification-leak-fix`) and Khian's BUG-033/BUG-040 EOS dead-code fixes (audit `2026-05-19-bug-033-040-eos-dead-code`).
- `unicorn-kb @ d43d7b0847f61cbe467481b4ea38ce6cdd8dbdcd`: unchanged this session.

---

## Decisions

### Priority list (verdicts captured for future me)

**P0 — fix soon, real user impact**

- `audit_send_evidence_reminders()` and `audit_send_24hr_confirmation()` are **both broken and unscheduled**. The first has a WHERE filter on `status='sent'` which doesn't match `evidence_requests` (flagged in `2026-05-18-evidence-request-workflow-restoration`). Neither is on pg_cron — no automated invoker exists. If anyone on the audit workflow team thinks these reminders fire automatically, they're wrong. **Blocked on a conversation with whoever owns audit workflow** (probably Carl or Angela) to determine whether these were intended to fire automatically, on what schedule, and whether to (a) wire them to pg_cron, (b) fold them into the outbox pattern, or (c) declare them deprecated and remove.

**P1 — cheap quality wins**

- Add `dedupe_key` to three direct-insert writers that currently don't set it: `follower` in `StageNotesTab.tsx:282`, `support_ticket` in `fn_notify_csc_on_support_ticket`, `note_shared`/`note_added` in `noteNotifications.ts`. Suggested formats: `follower:{note_id}:{recipient_id}`, `support_ticket:{thread_id}:{recipient_id}`, `note_shared:{note_id}:{recipient_id}`. Without this, rapid double-clicks produce duplicate bell rows.
- Decide quiet hours: either wire `notification_rules.quiet_hours_start/end` to `NotificationRulesCard` (~2 hours) or drop the columns (~10 min). They're respected by `process-notification-outbox` today but no user can set them. Pick one.

**P2 — eventual, not urgent**

- Archive/soft-delete cron for both `user_notifications` (older than 90 days) and `notification_outbox` (status IN ('sent','skipped') older than 30 days). Current volume is fine; will hurt at 12-month growth.
- Drop the four staff-caller direct inserts (`StageNotesTab`, `EosQCSession`, `QCScheduler`, `noteNotifications`) in favour of service-role edge functions, finishing the Phase 0.5 pattern. They pass RLS today but bypass `emit_notification()`'s event-type validation. Demoted from P2 to lower-P2 — they work, the risk is future-bug-shaped only.

**P3 — cleanup, defer**

- Drop `public.notification_audit_log` (dead table — defined, zero writers). Either implement delivery logging in `process-notification-outbox` or remove. Recommend remove.
- Retire `public.notification_schedule` once audit reminders move (depends on P0).
- One-row orphan cleanup: `user_notifications.id = 7d8e2c56-4f29-439a-b3e4-7f66967fde1f` (deleted user `3cafeb73-...`, tenant 42, 2025-12-18 `follower`). Trivial. Roll into a periodic orphan-cleanup cron rather than a one-off.
- Review whether `vanessa@vivacity.com.au`, `bonnie@vivacity.com.au`, `aj@vivacity.com.au` (currently `unicorn_role = 'User'`) should be promoted to a Vivacity-team role.

**Skip — not bugs, just architectural taste**

- The `useNotifications` "tenant leak" originally scored as P0 — sanity-checked and **disproved**. The write side is tenant-correct; staff are meant to see notifications across every tenant they're addressed to.
- Unify the two preferences tables (`notification_rules` Teams + `user_notification_prefs` in-app) — defensible split, no user complaints today.
- Unify the two write paths (`user_notifications` ↔ `notification_outbox`) — defensible split. Touch it only if a future feature needs unified history.
- Bounce / dead-letter for failed outbox rows — reactive fix if/when ops surfaces a real outage.

### Documentation

The priority list and architecture map live in this audit doc. Future sessions can find it via `git log --grep="notification"`. The `notification_architecture.md` project memory captures the durable facts for AI use; this audit captures it for humans.

---

## Open questions parked

- **Audit-reminder ownership.** Who owns the audit workflow (Carl? Angela?) and what's the intent for the two PL/pgSQL functions? Required input before P0 above can move.
- **`@vivacity.com.au` users with `unicorn_role = 'User'`.** Three real cases. Promote or confirm intentional?
- **`notification_audit_log` write path** — confirmed nothing writes to it today. Was a future-state design noted somewhere that we should look for before dropping the table?
- **`process-notification-outbox` retry ceiling.** Exponential backoff exists but no max-attempts ceiling found in scoped code. Failed rows could retry forever. Verify before any bounce-handling work.
- **No bounce/complaint webhook from Mailgun** found in `supabase/functions/`. Mailgun supports event webhooks (`bounce`, `complained`, etc.); the codebase doesn't appear to subscribe. Operationally invisible.

---

## Tag

`audit-2026-05-19-notification-system-survey`
