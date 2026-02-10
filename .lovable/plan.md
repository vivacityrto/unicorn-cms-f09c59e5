

## Apply Safe DDL Pack — New Tables Only

### Pre-flight checks (completed)

- `tga_rto_snapshots.id` is **uuid** — the FK from `tga_rto_acknowledgements` will work without changes.
- None of the 12 target tables exist yet — no conflicts expected.

### What will be created

| Group | Tables |
|-------|--------|
| 1. Client Portal Sessions | `client_portal_sessions` |
| 2. Client Documents | `client_documents`, `client_document_shares`, `client_document_requests` |
| 3. Tenant Conversations | `tenant_conversations`, `tenant_messages`, `tenant_message_attachments` |
| 4. Chatbot Audit Trail | `chat_sessions`, `chat_messages`, `chat_escalations` |
| 5. TGA Monitoring Add-ons | `tga_rto_flags`, `tga_rto_acknowledgements` |

### What will NOT be touched

- `meetings`, `meeting_participants`, `meetings_shared`, `tga_rto_snapshots` — already deployed, skipped entirely.

### Steps

1. Run the safe DDL migration exactly as provided (12 tables, all FKs, all indexes, wrapped in a transaction).
2. No RLS policies are included in this DDL — those will need to be added separately as a follow-up step when the application code starts querying these tables.
3. No code changes in this step — this is schema-only.

### Technical detail

- The migration will be executed as a single Supabase migration file.
- All foreign keys use `DROP CONSTRAINT IF EXISTS` before `ADD CONSTRAINT` for idempotency.
- All indexes use `CREATE INDEX IF NOT EXISTS`.
- The `BEGIN` / `COMMIT` wrapper ensures atomicity.

