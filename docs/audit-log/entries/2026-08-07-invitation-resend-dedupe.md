# Invitation resend timeline deduplication

- Confirmed two `invitation_sent` resend timeline rows for the same invitation
  were created 76ms apart by concurrent resend requests.
- Updated the invitation timeline trigger to serialize per invitation with a
  transaction advisory lock and suppress resend events within one minute.
- Removed only resend duplicates created within one second of an earlier row;
  legitimate resends remain separate timeline events.
