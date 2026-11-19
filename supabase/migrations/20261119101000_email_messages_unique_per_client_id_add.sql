-- Linked emails, step 1 (client key): unique on (user_uuid, external_message_id, client_id).
-- Additive. Applied to production before the functions that rely on it are deployed.
-- migration-target-project: yxkgdalkbrriasiyyrwk

CREATE UNIQUE INDEX IF NOT EXISTS email_messages_unique_per_user_client_id
  ON public.email_messages (user_uuid, external_message_id, client_id);
