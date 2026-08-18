# Audit: 2026-08-18 — conversation-client-participant-repair

**Trigger:** production verification
**Scope:** staff-created client conversations and their client participants. Did not change message content, read-history semantics, or unrelated tenant access.

## Findings
- Demo RTO's “Testing read activity” thread and its `tenant_messages` record were correctly created.
- It contained only the sending staff participant. The client message policy requires conversation participation, so the client portal correctly showed the thread but no messages. The message-read RPC likewise correctly rejected the non-participant user.
- The staff conversation flow queried `tenant_users` using a session accepted by `is_vivacity_team_safe`, but the applicable read policy did not include that predicate. The UI silently continued with an empty recipient list.

## Code changes
- Add the missing safe-team `tenant_users` SELECT policy.
- Backfill tenant users as `client` participants only on staff/CSC conversations where they are currently absent.
- Surface recipient lookup and participant-write failures in the staff message composer instead of silently creating a staff-only thread.

## Decisions
- Preserve the existing product rule: a staff-created tenant conversation is readable by that tenant's users.

## Open questions parked
- None.
