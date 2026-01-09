-- Phase A: Make tga_links tenant-first
-- 1) tenant_id column already exists (nullable), need to make it primary

-- 2) Drop NOT NULL constraint on client_id (make it optional legacy)
ALTER TABLE tga_links ALTER COLUMN client_id DROP NOT NULL;

-- 3) Add NOT NULL constraint on tenant_id after backfill
-- First backfill any null tenant_id values by looking up tenant_profile by rto_number
UPDATE tga_links tl
SET tenant_id = (
  SELECT tp.tenant_id 
  FROM tenant_profile tp 
  WHERE tp.rto_number = tl.rto_number 
  ORDER BY tp.updated_at DESC 
  LIMIT 1
)
WHERE tl.tenant_id IS NULL;

-- Now add NOT NULL constraint
ALTER TABLE tga_links ALTER COLUMN tenant_id SET NOT NULL;

-- 4) Add FK constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'tga_links_tenant_id_fkey' 
    AND table_name = 'tga_links'
  ) THEN
    ALTER TABLE tga_links 
    ADD CONSTRAINT tga_links_tenant_id_fkey 
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 5) Add UNIQUE constraint on (tenant_id, rto_number) if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'tga_links_tenant_rto_unique' 
    AND table_name = 'tga_links'
  ) THEN
    ALTER TABLE tga_links 
    ADD CONSTRAINT tga_links_tenant_rto_unique UNIQUE (tenant_id, rto_number);
  END IF;
END $$;

-- 6) Add indexes for lookups if not exist
CREATE INDEX IF NOT EXISTS idx_tga_links_tenant_rto ON tga_links(tenant_id, rto_number);
CREATE INDEX IF NOT EXISTS idx_tga_links_rto ON tga_links(rto_number);

-- Phase B: Data cleanup for RTO 91020 duplicates

-- 1) Clear the duplicate tenant_profile.rto_number for tenant 197 (keep 329)
UPDATE tenant_profile 
SET rto_number = NULL 
WHERE tenant_id = 197 AND rto_number = '91020';

-- 2) Delete tga_links row for (tenant_id=197, rto_number='91020')
DELETE FROM tga_links WHERE tenant_id = 197 AND rto_number = '91020';

-- 3) Upsert tga_links row for (tenant_id=329, rto_number='91020')
INSERT INTO tga_links (tenant_id, rto_number, is_linked, link_status, created_at, updated_at)
VALUES (329, '91020', true, 'linked', now(), now())
ON CONFLICT (tenant_id, rto_number) 
DO UPDATE SET is_linked = true, link_status = 'linked', updated_at = now();

-- 4) Also clean up any malformed TGA data for tenant 329 with wrong rto_code
DELETE FROM tga_rto_addresses WHERE tenant_id = 329 AND rto_code != '91020';
DELETE FROM tga_rto_contacts WHERE tenant_id = 329 AND rto_code != '91020';
DELETE FROM tga_rto_summary WHERE tenant_id = 329 AND rto_code != '91020';
DELETE FROM tga_rto_delivery_locations WHERE tenant_id = 329 AND rto_code != '91020';
DELETE FROM tga_scope_qualifications WHERE tenant_id = 329 AND rto_code != '91020';
DELETE FROM tga_scope_skillsets WHERE tenant_id = 329 AND rto_code != '91020';
DELETE FROM tga_scope_units WHERE tenant_id = 329 AND rto_code != '91020';
DELETE FROM tga_scope_courses WHERE tenant_id = 329 AND rto_code != '91020';