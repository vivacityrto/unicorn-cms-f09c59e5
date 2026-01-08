-- TGA Integration Reset Migration
-- Clear sync status and cached auth data for fresh start with new credentials

-- Reset sync status to clean state (using 'unknown' which is a valid status)
UPDATE public.tga_sync_status SET
  connection_status = 'unknown',
  is_syncing = false,
  current_job_id = NULL,
  last_sync_job_id = NULL,
  last_full_sync_at = NULL,
  last_delta_sync_at = NULL,
  last_health_check_at = NULL,
  last_health_check_result = NULL,
  products_count = 0,
  units_count = 0,
  organisations_count = 0,
  updated_at = now()
WHERE id = 1;

-- Clear any in-progress or stale sync jobs
UPDATE public.tga_sync_jobs SET
  status = 'cancelled',
  error_message = 'Cancelled during TGA credential reset',
  completed_at = now()
WHERE status IN ('pending', 'running');

-- Log the reset in audit
INSERT INTO public.client_audit_log (
  tenant_id,
  entity_type,
  action,
  actor_user_id,
  details
) VALUES (
  1,
  'tga_integration',
  'credentials_reset',
  NULL,
  jsonb_build_object(
    'reason', 'TGA integration reset for production credential configuration',
    'reset_at', now()::text,
    'actions', ARRAY[
      'Cleared sync status',
      'Cancelled pending jobs',
      'Updated credentials'
    ]
  )
);