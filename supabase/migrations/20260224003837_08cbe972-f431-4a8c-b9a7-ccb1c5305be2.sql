ALTER TABLE public.app_settings
ADD COLUMN IF NOT EXISTS sharepoint_site_url TEXT DEFAULT NULL;