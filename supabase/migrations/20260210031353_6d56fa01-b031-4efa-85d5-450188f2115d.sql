-- Remove all non-current scope rows from tenant_rto_scope
-- Going forward, only Current items are persisted by the sync edge function
DELETE FROM public.tenant_rto_scope
WHERE lower(trim(coalesce(status, ''))) != 'current';