ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS body_html text;

COMMENT ON COLUMN public.email_messages.body_html IS
  'Full HTML body captured at link time. Sanitised on read, never on write. Nullable for legacy rows.';

NOTIFY pgrst, 'reload schema';