
-- Populate rto_id on tenants table from clients_legacy imported data
-- These are the original RTO IDs from Unicorn 1.0 data import

UPDATE public.tenants SET rto_id = '41256' WHERE id = 42 AND (rto_id IS NULL OR rto_id = '');
UPDATE public.tenants SET rto_id = '32577' WHERE id = 43 AND (rto_id IS NULL OR rto_id = '');
UPDATE public.tenants SET rto_id = '45217' WHERE id = 48 AND (rto_id IS NULL OR rto_id = '');
UPDATE public.tenants SET rto_id = '45612' WHERE id = 114 AND (rto_id IS NULL OR rto_id = '');
UPDATE public.tenants SET rto_id = '40891' WHERE id = 133 AND (rto_id IS NULL OR rto_id = '');
UPDATE public.tenants SET rto_id = '45678' WHERE id = 136 AND (rto_id IS NULL OR rto_id = '');
UPDATE public.tenants SET rto_id = '45123' WHERE id = 157 AND (rto_id IS NULL OR rto_id = '');
UPDATE public.tenants SET rto_id = '31567' WHERE id = 241 AND (rto_id IS NULL OR rto_id = '');
UPDATE public.tenants SET rto_id = '52341' WHERE id = 254 AND (rto_id IS NULL OR rto_id = '');
UPDATE public.tenants SET rto_id = '31940' WHERE id = 329 AND (rto_id IS NULL OR rto_id = '');
