
-- Populate tenant_profile.rto_number from tenants.rto_id for all tenants with RTO IDs
-- Use upsert pattern: insert if not exists, update if exists

INSERT INTO public.tenant_profile (tenant_id, rto_number)
SELECT t.id, t.rto_id
FROM public.tenants t
WHERE t.rto_id IS NOT NULL AND t.rto_id != ''
ON CONFLICT (tenant_id) 
DO UPDATE SET 
  rto_number = EXCLUDED.rto_number,
  updated_at = now();
