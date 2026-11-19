# 2026-11-19 — One email can be linked to several clients

**Trigger:** Ezel could not link an email to SHCS because it was already linked to Indie Education. The modal showed "Edge Function returned a non-2xx status code" and hid the real reason.

**Decision (Carl, in chat, 19 Nov 2026):** show the real reason, and allow one email to be linked to several clients, once per client.

**Changes**
- `email_messages`: unique on `(user_uuid, external_message_id, tenant_id)` added to production as `email_messages_unique_per_client_add` (additive, applied first).
- `capture-outlook-email`: the duplicate check is per client. The message now reads "This email is already linked to this client".
- `addin-email-capture`: upsert uses `onConflict: 'user_uuid,external_message_id,tenant_id'`.
- `useLinkedEmails`: reads the function's response body, so the modal shows the real message.

**Pending, applied only after the two functions are deployed:** `supabase/migrations/20261119100000_email_messages_unique_per_client.sql` drops `email_messages_unique_per_user` and `email_messages_user_uuid_external_message_id_key`. Dropping them earlier would break the add-in's upsert.

**Rollback:** re-add `UNIQUE (user_uuid, external_message_id)`, once no email is linked to more than one client.
