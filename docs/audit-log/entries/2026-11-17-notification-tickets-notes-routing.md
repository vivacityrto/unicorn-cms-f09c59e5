# Audit: 2026-11-17 — notification-tickets-notes-routing

**Trigger:** ad-hoc. Rollout step 4 of the notification redesign ([design doc](../../kb/reference/notification-redesign-2026-11-17.md)), requested as part of "full execution and implementation": support tickets and notes use the owner-only resolver. The preference screens (rollout step 3) ship in the same PR.
**Scope:** one migration (functions only: `support_triage_recipients` replaced, two ticket functions updated in place, one new helper) plus front-end changes. No table, policy or trigger changed.
**Status:** applied to `unicorn-qa` and proven, then applied to production on 17 November 2026 (project `yxkgdalkbrriasiyyrwk`, version `20261117045159`). The front-end ships with the PR.

## What changed

**Migration `supabase/migrations/20261117170000_notification_tickets_notes_routing.sql`** (rollback in `supabase/migrations/rollback/20261117170000_notification_tickets_notes_routing.down.sql`):

- **`support_triage_recipients(p_assignee, p_exclude, p_tenant)`** replaces the 2-argument version (dropped first so no second overload is left). Behaviour: an assigned ticket still goes to the assignee. An unassigned ticket for a client whose primary CSC, delegates, watchers or opted-in staff can be notified goes to them, instead of every Super Admin, Team Leader and Team Member. It still goes to the old triage pool when there is no tenant, when the tenant is Vivacity's own (6372, where staff-created company and product tickets live), or when the tenant has no reachable owner.
- **Two callers updated in place** to pass the tenant: `create_support_ticket(...)` and `support_ticket_messages_after_insert()`. The migration does this with a guarded `replace()` over `pg_get_functiondef()` inside a `DO` block: each replacement is asserted, skipped if already applied, and the function must exist exactly once. Reason: both functions are large and were last changed by the support-tickets model migration; rewriting them by hand risked drift.
- **`get_client_notification_recipients(category, tenant)`** (signed-in staff only, never returns the caller) lets code that writes a notification itself ask the resolver who to tell.

**Front-end:**

- Bell: a gear in the popover header swaps the list for the preference checkboxes without leaving the popover (with a link to all settings).
- `/settings/notifications`: a preference matrix (category by In-app, Teams and Email, plus "whose clients" for client categories), per-client watch and mute, and assistant management (Super Admin for anyone, a CSC for their own).
- Note code (`src/lib/noteNotifications.ts`) now asks the database who owns the client instead of picking one primary CSC, and respects each person's matrix. Explicit "share with" notifications are unchanged.
- Generated types gained the new tables and functions (hand-added; regenerate from the database when convenient).

## Evidence

- `node scripts/audit-migrations.mjs --changed-only`: 0 findings.
- **`unicorn-qa`:** `supabase/qa-checks/notification_tickets_notes_tests.sql`, **17 checks, all passing, rolled back**, including a real `create_support_ticket` call as a client: the owner and the ticket delegate are notified, the other team members are not; a ticket for a tenant with no owner still reaches the pool of 3; the Vivacity tenant goes to the pool; one overload; both callers updated; the helper is staff-only and refuses a client user and `anon`.
- **One defect found by testing, fixed before production:** the first draft would have sent staff-created company and product tickets (tenant 6372) to that tenant's owners instead of the triage pool.
- **Production, read-only, after:** one overload of `support_triage_recipients`; both callers contain the tenant argument; `authenticated` can execute only the staff helper; `anon` none; an unassigned ticket for a sample owned tenant returns the primary CSC plus AJ and Ezel; the Vivacity tenant returns the 6-person pool.
- **Front-end:** see the PR for the type check, lint and test results.

## Known gaps

- **Teams and email for client messages, tickets and notes:** the matrix stores the choices, and the note code honours the Teams column, but ticket and message notifications are still written in-app only. Teams and email delivery for those categories is not yet wired to the matrix; the screen says so.
- **Package alerts and tasks** already go to one named person (the package's consultant, the task's assignee), so they were left as they are.
- **Existing Teams rules** (`notification_rules`) still control the Teams events they always did.

## Rollback

`supabase/migrations/rollback/20261117170000_notification_tickets_notes_routing.down.sql` restores the 2-argument function, the two callers and drops the helper. Reverting the front-end PR removes the screens; the database keeps working without them.

## Open questions parked

- Wire Teams and email delivery for resolver-based notifications (messages, tickets) to the matrix.
- The legacy four-category tab in `Settings` (`NotificationPrefsTab`) still controls the older reminders and is left in place.
