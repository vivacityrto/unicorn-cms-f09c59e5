-- Fix Sharwari Rajurkar's login issue
-- Set tenant_id to Vivacity (6372) and create tenant_members record

-- Update user's tenant_id
UPDATE public.users 
SET tenant_id = 6372, updated_at = now()
WHERE user_uuid = 'c8bcf03e-7282-488c-af14-ec3c90208136';

-- Create tenant_members record (if not exists)
INSERT INTO public.tenant_members (user_id, tenant_id, role, status, created_at, updated_at)
SELECT 'c8bcf03e-7282-488c-af14-ec3c90208136', 6372, 'Team Leader', 'active', now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.tenant_members 
  WHERE user_id = 'c8bcf03e-7282-488c-af14-ec3c90208136' AND tenant_id = 6372
);