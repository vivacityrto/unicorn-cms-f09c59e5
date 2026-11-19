-- Linked emails: one email can be linked to several clients, once per client.
-- Step 1 (applied first, additive): unique on (user_uuid, external_message_id, tenant_id).
-- Step 2 (this file, applied AFTER capture-outlook-email and addin-email-capture
-- are deployed): drop the old one-row-per-user-and-email constraints. Dropping them
-- first would break the add-in's upsert ON CONFLICT (user_uuid, external_message_id).
-- migration-target-project: yxkgdalkbrriasiyyrwk

ALTER TABLE public.email_messages DROP CONSTRAINT IF EXISTS email_messages_unique_per_user;
ALTER TABLE public.email_messages DROP CONSTRAINT IF EXISTS email_messages_user_uuid_external_message_id_key;
