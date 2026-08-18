# Audit: 2026-08-18 — broadcast-message-read-tracking

**Trigger:** ad-hoc
**Scope:** Client-portal conversation reads and broadcast-recipient reporting; no delivery or targeting behaviour changed.

## Findings
- The portal previously advanced `conversation_participants.last_read_at`, but there was no durable broadcast-recipient read timestamp or staff view of recipients who had read a campaign.
- The client hook attempted a direct application-level `audit_events` insert while loading messages; that table is staff-only, so it was not a reliable client activity record.

## KB changes shipped
- no changes

## Code changes (if this entry accompanies one)
- Uncommitted: added `broadcast_recipients.read_at`, a participant-scoped read RPC, client timeline events, and expandable recipient activity in bulk message history.

## Decisions
- A recipient is marked read only on their first read of the campaign's conversation, preserving a stable, reportable timestamp.
- General message reads are written once per newly read conversation to the existing client activity timeline.

## Open questions parked
- no changes
