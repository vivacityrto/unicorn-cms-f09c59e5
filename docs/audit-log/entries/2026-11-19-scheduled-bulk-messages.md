# Scheduled Bulk Message delivery

## Scope

Staff with full `admin.broadcast.send` permission can use **Communications → Bulk Message** to send immediately or schedule a single future broadcast. The **Superhero clients** audience uses the package IDs from the Superhero Membership Dashboard. The composer labels the time zone used for entry. The confirmation and scheduled history show Sydney time.

Bulk Message History shows the scheduled time and lets staff with the same permission cancel before the delivery worker locks the campaign. Scheduled rows have no fixed recipient count because delivery resolves the audience when it runs. A disabled, archived or missing account does not receive a scheduled message.

## Database

[Migration 20261119130000](../../../supabase/migrations/20261119130000_schedule_bulk_messages.sql) reserves scheduled writes for permission-checked RPCs, verifies attachment references against the message attachment bucket, and registers a one-minute `pg_cron` job. The worker locks due rows, checks sender access, resolves recipients, and writes to the existing conversation, participant, message, attachment and audit tables. The existing message trigger creates client inbox notifications. A failed tenant write rolls back that tenant's delivery before recording a failure. The worker processes up to three campaigns per tick.

Audit actions are `broadcast:schedule`, `broadcast:cancel`, `broadcast:send` and `broadcast:scheduled_send_failed`. Scheduled delivery writes the campaign and recipient outcomes in the same database transaction as the inbox messages.

## Verification and rollout

- The embedded PostgreSQL fixture exercised permission checks, early-send prevention, retry deduplication, cancellation, category and attachment delivery, membership changes, failed delivery rollback and sender revocation.
- A transaction on Unicorn QA validated the migration's database objects and grants and was rolled back. QA currently has no `pg_cron` extension, so registration was excluded from that check. Production has `pg_cron` 1.6.
- Pending production approval, apply the migration via Supabase MCP before releasing the frontend. Verify the scheduled job exists and the expected worker owns its command. Confirm the new controls and history on the deployed app before scheduling a client broadcast.
- To pause delivery, unschedule `deliver-scheduled-bulk-messages` in a separately approved operation. Pending campaign rows remain available for review and cancellation. Review overdue campaigns before re-enabling the job.
