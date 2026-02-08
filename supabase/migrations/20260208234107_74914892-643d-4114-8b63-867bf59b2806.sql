-- Fix Sharwari Rajurkar's missing tenant association
-- She is a Team Leader (Vivacity internal) but has no tenant_id or tenant_members record

-- 1. Set tenant_id to Vivacity (ID 6372)
UPDATE public.users
SET tenant_id = 6372,
    updated_at = now()
WHERE user_uuid = 'c8bcf03e-7282-488c-af14-ec3c90208136';

-- 2. Create tenant_members record
INSERT INTO public.tenant_members (user_id, tenant_id, role, status, created_at, updated_at)
VALUES (
  'c8bcf03e-7282-488c-af14-ec3c90208136',
  6372,
  'Admin',
  'active',
  now(),
  now()
)
ON CONFLICT (user_id, tenant_id) DO UPDATE SET
  status = 'active',
  updated_at = now();