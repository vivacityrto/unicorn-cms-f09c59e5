
-- Add provisioning and folder metadata columns to tenant_sharepoint_settings
ALTER TABLE public.tenant_sharepoint_settings
  ADD COLUMN IF NOT EXISTS site_id text,
  ADD COLUMN IF NOT EXISTS base_path text,
  ADD COLUMN IF NOT EXISTS folder_name text,
  ADD COLUMN IF NOT EXISTS folder_path text,
  ADD COLUMN IF NOT EXISTS provisioning_status text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS provisioning_error text,
  ADD COLUMN IF NOT EXISTS client_access_enabled boolean NOT NULL DEFAULT false;

-- Add check constraint for provisioning_status values
ALTER TABLE public.tenant_sharepoint_settings
  ADD CONSTRAINT chk_provisioning_status
  CHECK (provisioning_status IN ('not_started', 'pending', 'success', 'failed'));

-- Make root_folder_url nullable (auto-provisioned rows won't have a user-provided URL initially)
ALTER TABLE public.tenant_sharepoint_settings
  ALTER COLUMN root_folder_url DROP NOT NULL;

-- Update RLS: ensure client users can only read sharepoint_folder_url for their tenant
-- (existing RLS should already handle this, but let's ensure client read access)
DO $$ BEGIN
  -- Drop existing client read policy if it exists to recreate it
  DROP POLICY IF EXISTS "Client users can read their sharepoint settings" ON public.tenant_sharepoint_settings;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Client users can read their sharepoint settings"
  ON public.tenant_sharepoint_settings
  FOR SELECT
  USING (
    has_tenant_access_safe(tenant_id, auth.uid())
  );

-- Ensure Vivacity team can write
DO $$ BEGIN
  DROP POLICY IF EXISTS "Vivacity team can manage sharepoint settings" ON public.tenant_sharepoint_settings;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Vivacity team can manage sharepoint settings"
  ON public.tenant_sharepoint_settings
  FOR ALL
  USING (is_vivacity_internal_safe(auth.uid()))
  WITH CHECK (is_vivacity_internal_safe(auth.uid()));
