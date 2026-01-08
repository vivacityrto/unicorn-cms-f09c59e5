-- Clean up duplicate clients_legacy records
-- Strategy: Keep the row with foreign key references, else keep the OLDEST by created_at
-- This ensures data integrity with existing tga_links, audits, etc.

-- Step 1: Delete duplicates, keeping the one with references or oldest
DELETE FROM clients_legacy cl
WHERE id NOT IN (
  -- For each tenant_id, select the row to keep
  SELECT DISTINCT ON (tenant_id) id
  FROM (
    -- Rank rows: those with references get priority, then by created_at ASC (oldest first)
    SELECT 
      cl2.id,
      cl2.tenant_id,
      cl2.created_at,
      (EXISTS(SELECT 1 FROM tga_links tl WHERE tl.client_id = cl2.id)) as has_tga_link,
      (EXISTS(SELECT 1 FROM audit a WHERE a.client_id = cl2.id)) as has_audit,
      (EXISTS(SELECT 1 FROM audit_inspection ai WHERE ai.client_id = cl2.id)) as has_inspection
    FROM clients_legacy cl2
    ORDER BY 
      cl2.tenant_id,
      -- Prioritize rows with any foreign key reference
      (EXISTS(SELECT 1 FROM tga_links tl WHERE tl.client_id = cl2.id) OR
       EXISTS(SELECT 1 FROM audit a WHERE a.client_id = cl2.id) OR
       EXISTS(SELECT 1 FROM audit_inspection ai WHERE ai.client_id = cl2.id)) DESC,
      -- Then oldest by created_at
      cl2.created_at ASC
  ) ranked
)
AND tenant_id IN (
  -- Only process tenants with duplicates
  SELECT tenant_id FROM clients_legacy GROUP BY tenant_id HAVING COUNT(*) > 1
);

-- Step 2: Add unique constraint to prevent future duplicates
ALTER TABLE clients_legacy ADD CONSTRAINT clients_legacy_tenant_id_unique UNIQUE (tenant_id);