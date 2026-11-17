# Notification redesign: ownership-based routing and preferences (17 November 2026)

> **Last updated:** 2026-11-17 · **Reconsider by:** 2027-02-17 · **Confidence:** high for the current-state findings (read from live production on 17 November 2026, read-only); medium for the design, which is a proposal with open decisions and no code or migration yet.
>
> Standalone feature design, not one of the four tracked initiatives. Status: **proposed; all five decisions settled on 17 November 2026 (see "Decisions")**. Nothing in this document has been built, migrated or applied.

## Why

Staff are notified about every client, not their own. A client message today reaches all 19 active internal users, so the people who own the client are buried in traffic that belongs to someone else, and the bell stops being a reliable signal. Carl's brief:

- Staff should be notified by their own clients, with the audience decided by role (RBAC), not by a hard-coded list.
- Each person gets a notification preference control, reached from an icon on the bell.
- The main trigger is communications on a client's primary CSC (Client Success Champion), with an exception for assistants to consultants (named in the brief as AJ and Ezel), who need the notifications of the consultant they support. Everything else should be customisable by checkbox.

## Current state (verified against production, 17 November 2026)

**Two parallel systems.**

| System | Tables | Written by | Delivers to |
|---|---|---|---|
| Bell | `user_notifications` | Database triggers (for example `fn_tm_on_message_insert`) and some client-side inserts (`TasksManagement`, `EosQCSession`, `QCScheduler`, `AskVivFlagButton`, `StageNotesTab`, `noteNotifications.ts`) | In-app bell and `/my-notifications` |
| Teams | `notification_outbox`, `notification_rules`, `dd_notification_event` | `emit_notification(...)` (11 active event types) | Teams, through `process-notification-outbox` |

`notification_rules` is a per-user, per-event on/off switch that only `emit_notification` reads. `user_notification_prefs` holds `email_enabled`, `inapp_enabled`, `digest_enabled`, `quiet_hours` and `event_settings` (JSON), and the UI only exposes four categories in it (`tasks`, `meetings`, `obligations`, `events`). The two systems share no vocabulary: bell `type` values and `dd_notification_event` values do not map to each other.

**Findings.**

1. **Message routing ignores ownership.** `fn_tm_on_message_insert` sends every client-sent `tenant_messages` row to every active `is_vivacity_internal` user (the "Branch B" staff fan-out added 3 July 2026, see [messaging-pipeline.md](../codebase-state/messaging-pipeline.md)). In the 30 days to 17 November each of the 19 staff received the same 31 message notifications. Across all users there were 725 `message` rows in that period against 49 conversations.
2. **Ownership is modelled but unused.** `tenant_csc_assignments` has 67 active rows (58 labelled `CSC`, 9 `Primary CSC`, all `is_primary = true`). No notification logic reads it.
3. **Messages bypass preferences entirely.** The message trigger never reads `user_notification_prefs` or `notification_rules`. The four preference categories in the UI cover tasks, meetings, obligations and events, not messages, tickets or notes. All 21 saved preference rows are still on defaults.
4. **Non-people receive notifications.** The three `System Account` users and several test or duplicate accounts (names containing `Test`, `Carl (CST)`, `Carl (Reviewer)`) are in the staff fan-out and never read anything.
5. **Roles are not aligned with who owns clients.** Internal roles are `CSC` (9), `Super Admin` (9), `Team Member` (5), `System Account` (3), `Integrator` (2) and `BGT` (1). Several Super Admins hold that role for platform access, not client ownership, but receive client traffic as if they were owners.
6. **No assistant or delegate relationship exists anywhere in the data.** The two people named as assistants (AJ and Ezel) are titled Administrative Assistant and Administration Assistant on their profiles, but nothing records whom they assist: one holds the Super Admin role and is the CSC on 9 clients, the other has the CSC role and no assignments. The assistant concept needs a new model (decision 5 settles their scope).
7. **Other types are lower volume but unrouted.** In the last 30 days: `support_ticket` 72 rows to 24 recipients, `note_shared` 36, `note_added` 31, `ticket_submitted` 18, `ticket_reply` 9. Each picks recipients in its own trigger or component.

Not checked in this pass: the bell UI components (`NotificationDropdown`, `MyNotificationsPage`) beyond their hooks, and the full set of client-side insert paths. Re-verify both before building.

## Design

### 1. One recipient resolver

Replace per-trigger recipient logic with one SQL function, for example `resolve_notification_recipients(event_category, tenant_id, actor_user_id, subject_user_id)`, called by every emitter. It returns `(user_id, reason)` rows so the bell can say why a notification arrived ("you are the primary CSC", "you assist Tanya", "you are following this client").

Default audience per category (all subject to the recipient's own preferences):

| Category | Default audience |
|---|---|
| Client message | Tenant's primary CSC plus that CSC's delegates |
| Support ticket for a client | Assignee, else the tenant's primary CSC and delegates |
| Note added or shared | Tenant's primary CSC and delegates, and the named person for a share |
| Task assigned or overdue | The assignee |
| Package threshold, risk flagged | Tenant's primary CSC and delegates |
| Platform alerts (stalled bulk job, capacity) | Super Admins |

Always excluded: `System Account` users, archived or disabled users, test accounts (rows in a `notification_exempt_users` table, not a flag on `users` and not a name match: `users` carries table-wide write grants for signed-in users, so a flag there could be set by the user themselves), and the actor.

### 2. Delegates (the assistant exception)

A new table, `staff_notification_delegates`:

| Column | Purpose |
|---|---|
| `principal_user_id` | The consultant or CSC being assisted; null when `principal_kind = 'all_csc'` |
| `principal_kind` | `user` (one named principal) or `all_csc` (every CSC, including CSCs added later, so a new CSC needs no new rows) |
| `delegate_user_id` | The assistant |
| `tenant_id` | Null means all of the principal's clients; otherwise one client |
| `categories` | Which categories pass through (default: all) |
| `starts_at`, `ended_at` | Delegation window, so cover can be temporary |

A delegate receives whatever the principal would, for the clients and categories in scope, and sees the "you assist X" reason on each item.

**Recommendation: a separate table, not a new `role_label` on `tenant_csc_assignments`.** Several views and the client home hero read that table to mean "the CSC", and an assistant row there would show a client an assistant as their champion.

### 3. Preference matrix

A normalised `notification_preferences` table, server-readable by the resolver:

| Column | Purpose |
|---|---|
| `user_id`, `event_category`, `channel` | The cell: for example `client_message` by `in_app`, `teams`, `email` or `digest` |
| `scope` | `my_clients`, `my_and_delegated`, `all_clients` or `off` |
| `enabled` | The checkbox |

Defaults come from a `notification_role_defaults` table keyed by RBAC role, so changing a default does not need a deploy. Per-client overrides (watch or mute one client) are a small `notification_client_overrides` table that reuses the existing `follower` notion. Quiet hours and digest settings stay in `user_notification_prefs` and apply across all categories.

Starting defaults, to be agreed:

| Role | Default |
|---|---|
| CSC | Own clients: messages, tickets, notes, tasks, package thresholds |
| Super Admin | Platform alerts and escalations only; client traffic opt-in |
| Team Member, Integrator, BGT | Opt-in |
| System Account | Never |

### 4. The bell icon widget

A gear on the bell popover opens a compact panel: one row per category with checkboxes for in-app, Teams and email, a scope selector on client-linked rows, and a link to the full settings page. The full page (`/notification-settings`) keeps the Teams connection and quiet hours, and gains the per-client override list. The existing four-category tab (`NotificationPrefsTab`) is replaced by the matrix.

### 5. Safety net so client messages are never orphaned

Narrowing delivery risks a client message that nobody sees. Rules:

- A tenant with no active primary CSC routes to Super Admins as an "unassigned" notification.
- A client message unread by every owner recipient (primary CSC and delegates, who all receive it from the start) for 4 working hours escalates once to Super Admins (decision 4).
- The reason string makes escalations visible, and an `escalated` flag allows measuring how often it fires.

### 6. Unify the two pipelines

`emit` becomes the single entry point: it resolves recipients, applies preferences, writes `user_notifications` for in-app and `notification_outbox` for Teams and email. Client-side inserts are retired one by one in favour of RPC calls, and the bell `type` and `dd_notification_event` vocabularies are mapped to one category list (one-time mapping table).

## Rollout

One PR each, in this order. Every database step is hand-written and needs an audit entry under `docs/audit-log/entries/` per the AGENTS.md schema rules.

1. **Foundation (database).** The new tables (category lookup, role defaults, preferences, client overrides, delegates, exempt accounts), the resolver, and the delegate RPC with its audit writes (decision 3). No behaviour change: nothing calls the resolver yet. No existing table is altered, so no per-column `GRANT` or RPC-body sweep is needed. **Status: migration `20261117140000_notification_routing_foundation.sql` written and proven on `unicorn-qa` (40 rolled-back checks, all passing); production apply pending.** The AJ and Ezel delegate links and the exempt accounts are data, applied as a separate audited production step. See [the audit entry](../../audit-log/entries/2026-11-17-notification-routing-foundation.md).
2. **Messages.** Swap `fn_tm_on_message_insert` Branch B for the resolver. Use `DROP FUNCTION` first if the signature changes, then confirm exactly one overload remains. Verify on `unicorn-qa` with real assignments before production, and run a shadow period that logs what the resolver would have sent next to what was sent. Adds the escalation cron job (decision 4), which also runs in shadow mode first.
3. **UI.** Bell gear popover, preference matrix, per-client overrides, delegates management (Super Admins for anyone, CSCs for their own assistants).
4. **Other categories.** Tickets, notes, tasks and package thresholds move to the resolver, and the client-side inserts are retired.
5. **Clean-up.** Remove the legacy four-category tab and the superseded `event_settings.categories` path, once nothing reads them.

## Risks

- **Missed client messages** after narrowing: mitigated by the unassigned and unread escalations, and by the shadow period in step 2.
- **Stale ownership data:** routing is only as good as `tenant_csc_assignments`. Fix or audit assignments for active tenants before cut-over.
- **Notification fatigue moves rather than disappears** if defaults are wrong: measure read rate per category before and after.
- **Trigger-based authorization caveat:** any check on `request.jwt.claim.role` does not protect edge-function writes (see AGENTS.md). Delegate management must be enforced by RLS and an RPC, not only by the page.

## Decisions

1. **Non-CSC staff default for client messages. Decided 17 November 2026 (Carl): owner-only plus escalation.** Only the tenant's primary CSC and their delegates are notified by default. A tenant with no active primary CSC, or a message unread for the escalation period, escalates once to Super Admins (timing is open decision 4). Other staff (Super Admins, Team Members, Integrators, BGT) can opt in per client or globally in their preferences. Rejected: keeping all-staff delivery with quiet low-priority entries, and owner-only with no escalation (an absent or unassigned owner could leave a client message unseen).

2. **Teams and email. Decided 17 November 2026 (Carl): one matrix for all channels.** In-app, Teams and email are columns of the same preference matrix, and owner-only routing from decision 1 applies to every channel. Teams delivery therefore moves off `notification_rules` onto `notification_preferences` and the resolver (rollout step 4 at the latest; `emit` already writes `notification_outbox` for Teams). Existing `notification_rules` rows are migrated into the matrix so nobody loses a Teams setting they already chose. Rejected: bell-only (Teams could still ping non-owners) and matrix-now-Teams-later.

3. **Who maintains delegates. Decided 17 November 2026 (Carl): Super Admins, plus CSCs for their own assistants.** Super Admins can create or end a delegate link for anyone. A CSC can create or end links only where they are the `principal_user_id`, and only for tenants where they hold an active assignment in `tenant_csc_assignments` (a null tenant means "all my clients", which a CSC may grant only for themselves). Enforcement is by RLS and a `SECURITY DEFINER` RPC that checks the caller, not by the page: the RPC rejects a delegate who is not an active internal user, a `System Account` or an exempt account, and a principal other than the caller unless the caller is a Super Admin. Links are ended (`ended_at`), never deleted, and every create or end writes an `audit_events` row naming who granted what, so access to client messages and notes can be reviewed. Rejected: Super Admins only, and a CSC request flow with Super Admin approval. The cost of the chosen option is the RPC and audit trail, which are part of rollout step 1.

4. **Escalation timing and recipients. Decided 17 November 2026 (Carl): 4 working hours, then Super Admins, once.** The clock counts the primary CSC's working time, using `users.timezone`, `working_days` and `working_hours` (defaulting to Australia/Sydney, Monday to Friday, 9 am to 5 pm where a profile is blank). A message sent at 4:30 pm therefore escalates late the next morning. The message escalates only if none of the owner recipients has read it; one read stops the clock. A tenant with no active primary CSC skips the wait and goes to Super Admins immediately. Each escalation is marked on the notification (`escalated`, with the reason) so firing rates can be measured. Implementation needs a scheduled job (cron) that scans unread owner notifications against the clock, in rollout step 2. Rejected: 2 working hours (more escalation noise for owners in meetings) and next working day (a client could wait most of a day).

5. **The assistants. Decided 17 November 2026 (Carl): AJ and Ezel are delegates of every CSC.** Each is seeded as one `principal_kind = 'all_csc'` delegate row with no tenant restriction and all categories, so they receive client notifications for every CSC-owned client, including CSCs and clients added later. AJ also keeps the 9 clients AJ is already primary CSC on. Consequences to accept: these two will see roughly the volume the all-staff fan-out sends today for CSC-owned clients, and because AJ is also a Super Admin, AJ's escalation notifications must be deduplicated against the delegate notification (one row per user per message, by `dedupe_key`). The earlier brief named RJ; the correct pair is AJ and Ezel. Seeding is part of rollout step 1 and is verified against `tenant_csc_assignments` before cut-over. Only `all_csc` links may be created by a Super Admin; a CSC can grant `user` links for themselves only.

All decisions are now settled; the doc is ready for review and merge.

## Related documents

- [notification-system-behavior.md](notification-system-behavior.md): `emit_notification` validation and the 10-event wiring.
- [messaging-pipeline.md](../codebase-state/messaging-pipeline.md): the message trigger chain and the July 2026 staff fan-out this design replaces.
- [support-tickets-overhaul-2026-11-13.md](support-tickets-overhaul-2026-11-13.md): ticket notifications that move to the resolver in step 4.
