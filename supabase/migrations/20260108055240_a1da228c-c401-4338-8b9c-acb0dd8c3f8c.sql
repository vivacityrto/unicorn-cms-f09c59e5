
-- Correct tenant RTO IDs based on tenant_profile data
UPDATE public.tenants SET rto_id = '45003' WHERE id = 133;
UPDATE public.tenants SET rto_id = '40539' WHERE id = 364;
