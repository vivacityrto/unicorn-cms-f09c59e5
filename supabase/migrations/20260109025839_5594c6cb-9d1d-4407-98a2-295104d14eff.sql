-- TGA Data Repair Migration
-- 1. Clean up malformed rows for tenant 329 where rto_code is truncated
DELETE FROM tga_rto_addresses WHERE tenant_id = 329 AND rto_code != '91020';
DELETE FROM tga_rto_contacts WHERE tenant_id = 329 AND rto_code != '91020';
DELETE FROM tga_rto_summary WHERE tenant_id = 329 AND rto_code != '91020';
DELETE FROM tga_rto_delivery_locations WHERE tenant_id = 329 AND rto_code != '91020';

-- 2. Add unique constraint to tga_rto_summary (tenant_id, rto_code) if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tga_rto_summary_tenant_rto_unique'
  ) THEN
    ALTER TABLE tga_rto_summary ADD CONSTRAINT tga_rto_summary_tenant_rto_unique UNIQUE (tenant_id, rto_code);
  END IF;
END $$;

-- 3. Add index on tga_debug_payloads for faster lookups
CREATE INDEX IF NOT EXISTS idx_tga_debug_payloads_tenant_fetched 
  ON tga_debug_payloads(tenant_id, fetched_at DESC);

-- 4. Update tga_import_runs status check constraint to include 'completed' for backwards compatibility
ALTER TABLE tga_import_runs DROP CONSTRAINT IF EXISTS tga_import_runs_status_check;
ALTER TABLE tga_import_runs ADD CONSTRAINT tga_import_runs_status_check 
  CHECK (status IN ('running', 'success', 'failed', 'completed'));

-- 5. Update tga_rto_import_jobs status check constraint to include all used statuses
ALTER TABLE tga_rto_import_jobs DROP CONSTRAINT IF EXISTS tga_rto_import_jobs_status_check;
ALTER TABLE tga_rto_import_jobs ADD CONSTRAINT tga_rto_import_jobs_status_check 
  CHECK (status IN ('pending', 'processing', 'queued', 'success', 'failed', 'completed', 'skipped'));