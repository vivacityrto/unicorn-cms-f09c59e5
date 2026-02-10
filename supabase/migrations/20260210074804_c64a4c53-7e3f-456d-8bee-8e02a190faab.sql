
-- Add raw copilot storage toggle to app_settings
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS minutes_store_raw_copilot_input boolean NOT NULL DEFAULT false;
