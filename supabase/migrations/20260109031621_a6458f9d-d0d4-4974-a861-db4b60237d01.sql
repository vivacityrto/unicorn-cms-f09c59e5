
-- Phase 1: TGA Integration Database Fixes
-- ============================================

-- A) Add tenant_id to tga_links for proper tenancy mapping
-- Step 1: Add the column (nullable first)
ALTER TABLE tga_links ADD COLUMN IF NOT EXISTS tenant_id bigint;

-- Step 2: Backfill tenant_id by joining on rto_number
UPDATE tga_links tl
SET tenant_id = tp.tenant_id
FROM tenant_profile tp
WHERE tp.rto_number = tl.rto_number
  AND tl.tenant_id IS NULL;

-- Step 3: Add foreign key constraint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tga_links_tenant_id_fkey'
  ) THEN
    ALTER TABLE tga_links 
    ADD CONSTRAINT tga_links_tenant_id_fkey 
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Step 4: Create index for tenant_id lookups
CREATE INDEX IF NOT EXISTS idx_tga_links_tenant_id ON tga_links(tenant_id);

-- B) Add unique constraints for idempotency (only if not already present)

-- tga_rto_summary: UNIQUE (tenant_id, rto_code)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tga_rto_summary_tenant_rto_unique'
  ) THEN
    ALTER TABLE tga_rto_summary 
    ADD CONSTRAINT tga_rto_summary_tenant_rto_unique UNIQUE (tenant_id, rto_code);
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- tga_rto_contacts: UNIQUE (tenant_id, rto_code, contact_type, name)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tga_rto_contacts_tenant_rto_type_name_unique'
  ) THEN
    ALTER TABLE tga_rto_contacts 
    ADD CONSTRAINT tga_rto_contacts_tenant_rto_type_name_unique 
    UNIQUE (tenant_id, rto_code, contact_type, name);
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- tga_rto_delivery_locations: UNIQUE (tenant_id, rto_code, address_line_1, suburb, postcode)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tga_rto_delivery_locations_tenant_unique'
  ) THEN
    ALTER TABLE tga_rto_delivery_locations 
    ADD CONSTRAINT tga_rto_delivery_locations_tenant_unique 
    UNIQUE (tenant_id, rto_code, address_line_1, suburb, postcode);
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- C) Add contact_type_raw column to store the raw XML value for debugging
ALTER TABLE tga_rto_contacts ADD COLUMN IF NOT EXISTS contact_type_raw text;

-- D) Cleanup script for tenant 329 - remove malformed rows
-- Delete any records for tenant_id = 329 where rto_code != '91020'
DELETE FROM tga_rto_addresses WHERE tenant_id = 329 AND rto_code != '91020';
DELETE FROM tga_rto_summary WHERE tenant_id = 329 AND rto_code != '91020';
DELETE FROM tga_rto_contacts WHERE tenant_id = 329 AND rto_code != '91020';
DELETE FROM tga_rto_delivery_locations WHERE tenant_id = 329 AND rto_code != '91020';
DELETE FROM tga_scope_qualifications WHERE tenant_id = 329 AND rto_code != '91020';
DELETE FROM tga_scope_skillsets WHERE tenant_id = 329 AND rto_code != '91020';
DELETE FROM tga_scope_units WHERE tenant_id = 329 AND rto_code != '91020';
DELETE FROM tga_scope_courses WHERE tenant_id = 329 AND rto_code != '91020';

-- E) Add index for debug payload lookups
CREATE INDEX IF NOT EXISTS idx_tga_debug_payloads_tenant_fetched 
ON tga_debug_payloads(tenant_id, fetched_at DESC);

-- F) Add state code mapping helper
CREATE TABLE IF NOT EXISTS tga_state_codes (
  code text PRIMARY KEY,
  name text NOT NULL,
  abbreviation text NOT NULL
);

INSERT INTO tga_state_codes (code, name, abbreviation) VALUES
  ('01', 'New South Wales', 'NSW'),
  ('02', 'Victoria', 'VIC'),
  ('03', 'Queensland', 'QLD'),
  ('04', 'South Australia', 'SA'),
  ('05', 'Western Australia', 'WA'),
  ('06', 'Tasmania', 'TAS'),
  ('07', 'Northern Territory', 'NT'),
  ('08', 'Australian Capital Territory', 'ACT'),
  ('09', 'Other Territories', 'OT')
ON CONFLICT (code) DO NOTHING;
