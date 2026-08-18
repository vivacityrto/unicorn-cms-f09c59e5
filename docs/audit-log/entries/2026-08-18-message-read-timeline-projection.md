# Audit: 2026-08-18 — message-read-timeline-projection

**Trigger:** drift-surfaced
**Scope:** the broadcast-read tracking RPC, the Demo RTO read record, and the two staff-facing activity feeds. Did not audit unrelated timeline event producers.

## Findings
- Demo RTO's test read was recorded at `2026-08-18 02:35:45 UTC` in `client_audit_log`, including both `message:read` and `broadcast:read` rows.
- Client Detail → Timeline and the Client Activity dashboard read `client_timeline_events`, not `client_audit_log`; the original read-tracking implementation therefore had no path to either staff-facing feed.
- The original audit description incorrectly stated that the feature wrote a per-client timeline event.

## KB changes shipped
- No changes.

## Code changes
- Pending commit: add the internal `message_read` timeline event type and project a newly read conversation through the existing participant-scoped RPC.
- Pending commit: replace the wide broadcast recipient table with Campaign → Client → Recipient expansion and prevent the client inbox from switching to a two-pane layout before enough horizontal room is available.

## Decisions
- Use a single internal `message_read` timeline event, titled `Broadcast message read` when the conversation is a broadcast, rather than emitting duplicate generic and broadcast timeline rows.

## Open questions parked
- Production deployment requires explicit approval because it replaces a live `SECURITY DEFINER` RPC and changes the shared timeline event-type constraint.
