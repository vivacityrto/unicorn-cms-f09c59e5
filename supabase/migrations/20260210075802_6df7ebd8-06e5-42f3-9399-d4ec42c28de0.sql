-- Add auto-fetch feature flags for Copilot recap retrieval
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS minutes_copilot_auto_fetch_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS minutes_copilot_auto_fetch_fallback_to_paste boolean NOT NULL DEFAULT true;