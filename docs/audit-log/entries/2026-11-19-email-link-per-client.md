# 2026-11-19 — One email can be linked to several clients

**Trigger:** Ezel could not link an email to SHCS because it was already linked to Indie Education. The modal showed "Edge Function returned a non-2xx status code" and hid the real reason.

**Decision (Carl, in chat, 19 Nov 2026):** show the real reason, and allow one email to be linked to several clients, once per client.

**Changes**
- `email_messages`: unique on `(user_uuid, external_message_id, tenant_id)` added to production as `email_messages_unique_per_client_add` (additive). This is superseded by the client key below and dropped in step 2.
- `email_messages`: unique on `(user_uuid, external_message_id, client_id)` added to production as `email_messages_unique_per_client_id_add` (additive, applied before the functions that use it).
- Links from the modal now always store the client in `client_id`, including package- and task-linked emails. These now appear on that client's Emails tab (Carl's decision, 19 Nov 2026).
- `capture-outlook-email`: the duplicate check is per client. The message now reads "This email is already linked to this client".
- `addin-email-capture`: upsert uses `onConflict: 'user_uuid,external_message_id,tenant_id'`.
- `useLinkedEmails`: reads the function's response body, so the modal shows the real message.

**Step 2 — applied 19 Nov 2026 after the edge function deploy (run 44456646498, success), as `email_messages_unique_per_client_drop_old`.** Verified: the only unique index on linked emails is now `(user_uuid, external_message_id, client_id)`.

The original step-2 instruction, for reference: `supabase/migrations/20261119100000_email_messages_unique_per_client.sql` drops `email_messages_unique_per_user`, `email_messages_user_uuid_external_message_id_key` and the tenant index. Applying it before the deploy breaks the add-in's upsert.

**Rollback:** re-add `UNIQUE (user_uuid, external_message_id)`, once no email is linked to more than one client.
