# Audit: 2026-11-17 — notification-inbox-cleanup

**Trigger:** ad-hoc, after the notification redesign decisions ([design doc](../../kb/reference/notification-redesign-2026-11-17.md)). Carl asked that, under the new ownership-based setup, a staff member such as Dave should have no notification waiting for a client they do not own.
**Scope:** one production data change to `public.user_notifications` (unread `message` rows for internal staff). No schema, RLS, trigger or code change. Other notification types were not touched.
**Status:** applied to production on 17 November 2026 (project `yxkgdalkbrriasiyyrwk`) with Carl's explicit go-ahead; verified read-only afterwards.

## What changed

398 unread client-message notifications were marked read (`is_read = true`) for internal staff who are not that client's owner under the new rules. Rows were kept, not deleted. Each changed row carries `metadata.cleared_by = 'notification-redesign-2026-11-17'` and `metadata.cleared_at`.

A row was **kept unread** when the recipient is, for that message's tenant:

- the tenant's active primary CSC (an active row in `tenant_csc_assignments`, and the recipient is not a `System Account`);
- AJ or Ezel (delegates of every CSC under decision 5), where the tenant has an active CSC assignment; or
- a Super Admin, where the tenant has no active CSC assignment at all (the "unassigned" escalation).

Result: 400 unread message rows before, 2 after (both AJ's). Dave: 1 unread before (not for a client he owns), 0 after.

## Evidence

- Dry run (read-only, same predicate): 400 unread message rows for active internal staff, 2 kept, 398 to clear, 1 of them Dave's. Per-user dry run before that showed no recipient had an unread message for a client they own, so owners lost nothing.
- Write: one `UPDATE … RETURNING` returned 398 rows.
- Postflight: `metadata->>'cleared_by'` matched 398 rows, all `is_read = true`; Dave 0 unread; Carl, Sharwari and Ezel 0 unread; AJ 2 unread messages.
- The Teams outbox (`notification_outbox`) had no queued or pending rows, so nothing was pending there.

## Rollback

Reversible without a backup table, because every changed row is tagged:

```sql
UPDATE public.user_notifications
   SET is_read = false,
       metadata = metadata - 'cleared_by' - 'cleared_at'
 WHERE metadata->>'cleared_by' = 'notification-redesign-2026-11-17';
```

## Not changed, and why

- **Other unread types for staff** were left alone: `meeting_upcoming` (180), `support_ticket` (114), `note_shared` (72), `suggestion_submitted` (30), `note_added` (15), `ticket_submitted` (7), `task_due` (7), `qc_scheduled` (4), `qc_reminder` (1), `ticket_reply` (1). Ticket, note and task routing moves to the resolver in rollout step 4, and some of these rows are legitimately assigned to the person.
- **The inbox refills.** The message trigger (`fn_tm_on_message_insert`, Branch B) still sends every client-sent message to all active internal staff until rollout step 2 ships. The cleanup is one-off and is repeated at the step 2 cutover.

## Decisions

- Mark read, not delete, so history stays and the change is reversible.
- Owners are decided from `tenant_csc_assignments` at the time of the change, not from the message's original recipients.

## Open questions parked

- Whether to clear the other unread types for non-owners once their routing is in place (step 4).
