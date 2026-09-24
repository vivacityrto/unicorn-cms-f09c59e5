-- Part of the Outlook Inbox redesign: persist Microsoft's per-message
-- category labels and conversationId onto linked emails so the "Linked
-- Emails" / Outlook Inbox browser can show them (categories as chips,
-- conversation_id for a future "view full thread" affordance) without
-- re-fetching from Graph. Both nullable, no backfill — populated going
-- forward by capture-outlook-email on link/relink/refresh.
alter table public.email_messages
  add column conversation_id text,
  add column categories text[];

comment on column public.email_messages.conversation_id is 'Microsoft Graph conversationId for this message, used to group threaded emails.';
comment on column public.email_messages.categories is 'Microsoft Outlook category labels assigned to this message in the user''s real mailbox (free-text names, no colour data available without the MailboxSettings.Read scope).';
