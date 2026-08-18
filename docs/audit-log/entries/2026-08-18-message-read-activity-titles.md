# Audit: 2026-08-18 — message-read-activity-titles

**Trigger:** dashboard verification
**Scope:** message-read timeline event wording only. Did not change read eligibility, recipient access, or broadcast delivery state.

## Findings
- The dashboard correctly rendered the reader-specific `body` for `message_read` events, but that body did not include the direct-message or broadcast subject.
- Staff could therefore see who read an item but not which item had been read.

## Code changes
- Add the conversation subject as `message_title` metadata and render it in new read-event bodies.
- Backfill existing read-event bodies from their linked tenant conversations.

## Decisions
- Use concise activity wording: `Reader read "Message title".` and `Reader read broadcast "Broadcast title".`

## Open questions parked
- None.
