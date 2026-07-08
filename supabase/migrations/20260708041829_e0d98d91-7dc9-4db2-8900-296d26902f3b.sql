ALTER TABLE public.tenant_sharepoint_settings
  ADD COLUMN IF NOT EXISTS shared_live_status text,
  ADD COLUMN IF NOT EXISTS governance_live_status text,
  ADD COLUMN IF NOT EXISTS live_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS live_check_error text;

COMMENT ON COLUMN public.tenant_sharepoint_settings.shared_live_status IS 'Cached live Graph verification of the shared folder: ok | missing | unconfigured | error. NULL = not yet checked. Populated by check-tenant-sharepoint-liveness on best-effort basis.';
COMMENT ON COLUMN public.tenant_sharepoint_settings.governance_live_status IS 'Cached live Graph verification of the governance folder: ok | missing | unconfigured | error. NULL = not yet checked. Populated by check-tenant-sharepoint-liveness on best-effort basis.';
COMMENT ON COLUMN public.tenant_sharepoint_settings.live_checked_at IS 'Timestamp of the last live Graph check that wrote to live_status columns. NULL = never checked.';
COMMENT ON COLUMN public.tenant_sharepoint_settings.live_check_error IS 'Concatenated per-folder error details from the most recent live check, or NULL if both folders were ok/missing/unconfigured.';