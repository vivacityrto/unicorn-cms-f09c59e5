-- Backfill tenant_id in package_instances using legacy_id mapping
UPDATE public.package_instances pi
SET tenant_id = t.id
FROM public.tenants t
WHERE t.legacy_id = pi.client_id
  AND pi.tenant_id IS NULL;