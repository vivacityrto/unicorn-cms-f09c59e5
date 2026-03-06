ALTER TABLE public.tenant_sharepoint_settings
  ADD COLUMN IF NOT EXISTS shared_folder_item_id text,
  ADD COLUMN IF NOT EXISTS shared_folder_name text;