-- Ensure tga_links has proper constraints (idempotent - skip if exists)
DO $$
BEGIN
  -- Add index on tenant_id if not exists
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_tga_links_tenant_id_only') THEN
    CREATE INDEX idx_tga_links_tenant_id_only ON tga_links(tenant_id);
  END IF;
  
  -- Add index on (tenant_id, rto_number) if not exists
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_tga_links_tenant_rto') THEN
    CREATE INDEX idx_tga_links_tenant_rto ON tga_links(tenant_id, rto_number);
  END IF;
END $$;

-- Remove orphaned tenant_profile rows for deleted tenants
DELETE FROM tenant_profile tp
WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = tp.tenant_id);

-- Remove orphaned tga_links rows for deleted tenants  
DELETE FROM tga_links tl
WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = tl.tenant_id);

-- Remove orphaned TGA data for deleted tenants
DELETE FROM tga_rto_summary ts
WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = ts.tenant_id);

DELETE FROM tga_rto_contacts tc
WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = tc.tenant_id);

DELETE FROM tga_rto_addresses ta
WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = ta.tenant_id);

DELETE FROM tga_rto_delivery_locations tdl
WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = tdl.tenant_id);

DELETE FROM tga_scope_qualifications tsq
WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = tsq.tenant_id);

DELETE FROM tga_scope_skillsets tss
WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = tss.tenant_id);

DELETE FROM tga_scope_units tsu
WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = tsu.tenant_id);

DELETE FROM tga_scope_courses tsc
WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = tsc.tenant_id);

DELETE FROM tga_rto_import_jobs tij
WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = tij.tenant_id);

DELETE FROM tga_debug_payloads tdp
WHERE NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = tdp.tenant_id);