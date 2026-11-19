-- Linked emails, step 2: DEFERRED. Apply only AFTER the capture-outlook-email and
-- addin-email-capture changes are deployed (they conflict on, and check against,
-- the per-client key from 20261119101000).
-- Dropping the old one-per-user constraints earlier breaks the add-in's upsert.
-- Drops the old constraints and the tenant-keyed index from the earlier step.
-- migration-target-project: yxkgdalkbrriasiyyrwk

ALTER TABLE public.email_messages DROP CONSTRAINT IF EXISTS email_messages_unique_per_user;
ALTER TABLE public.email_messages DROP CONSTRAINT IF EXISTS email_messages_user_uuid_external_message_id_key;
DROP INDEX IF EXISTS public.email_messages_unique_per_user_client;
