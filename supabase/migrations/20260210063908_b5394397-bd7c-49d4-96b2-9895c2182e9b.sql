ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS microsoft_addin_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS addin_outlook_mail_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS addin_meetings_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS addin_documents_enabled BOOLEAN NOT NULL DEFAULT false;