-- Add setup_mode and manual_folder_url to tenant_sharepoint_settings
ALTER TABLE public.tenant_sharepoint_settings
  ADD COLUMN IF NOT EXISTS setup_mode text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS manual_folder_url text NULL;

-- Add check constraint for setup_mode values
ALTER TABLE public.tenant_sharepoint_settings
  ADD CONSTRAINT chk_setup_mode CHECK (setup_mode IN ('auto', 'manual'));

-- Comment for clarity
COMMENT ON COLUMN public.tenant_sharepoint_settings.setup_mode IS 'auto = provisioned via edge function, manual = pasted by Vivacity team';
COMMENT ON COLUMN public.tenant_sharepoint_settings.manual_folder_url IS 'Manually pasted SharePoint folder URL (used when setup_mode=manual)';