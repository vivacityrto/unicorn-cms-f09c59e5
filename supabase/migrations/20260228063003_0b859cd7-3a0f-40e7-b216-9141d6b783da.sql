-- Backfill xero_contact_url from legacy U1_XeroURL table
UPDATE public.tenants t
SET xero_contact_url = x.xero_url
FROM unicorn1."U1_XeroURL" x
WHERE t.id = x.client_id
  AND (t.xero_contact_url IS NULL OR t.xero_contact_url = '');