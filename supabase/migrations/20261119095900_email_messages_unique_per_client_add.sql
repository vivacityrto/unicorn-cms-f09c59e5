-- Linked emails, step 1 of 2: allow one email to be linked to several clients,
-- once per client. Additive; the old constraints are dropped in the next migration.
-- migration-target-project: yxkgdalkbrriasiyyrwk

CREATE UNIQUE INDEX IF NOT EXISTS email_messages_unique_per_user_client
  ON public.email_messages (user_uuid, external_message_id, tenant_id);
