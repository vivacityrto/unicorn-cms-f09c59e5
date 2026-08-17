-- Tenant 7523's canonical tenant name predates its current TGA summary.
-- Folder provisioning reads tenants.legal_name, so align only this confirmed
-- stale row with the already-synced TGA summary. Future per-tenant syncs are
-- aligned by the companion tga-rto-sync source change.
UPDATE public.tenants AS t
SET
  legal_name = s.legal_name,
  rto_name = COALESCE(NULLIF(BTRIM(s.trading_name), ''), s.legal_name),
  tga_legal_name = s.legal_name
FROM public.tga_rto_summary AS s
WHERE t.id = 7523
  AND s.tenant_id = t.id
  AND s.rto_code = t.rto_id
  AND NULLIF(BTRIM(s.legal_name), '') IS NOT NULL;
