-- Fix: Ensure all Super Admin users have tenant_id = 6372 (Vivacity) and tenant_members records
-- This ensures consistent access across all Super Admins

-- Update all Super Admin users to have tenant_id = 6372
UPDATE public.users
SET tenant_id = 6372
WHERE unicorn_role = 'Super Admin'
  AND (archived = false OR archived IS NULL)
  AND (tenant_id IS NULL OR tenant_id != 6372);

-- Create tenant_members records for all Super Admins who don't have one
INSERT INTO public.tenant_members (user_id, tenant_id, role, status, joined_at)
SELECT 
  u.user_uuid,
  6372,
  'Admin',
  'active',
  NOW()
FROM public.users u
WHERE u.unicorn_role = 'Super Admin'
  AND (u.archived = false OR u.archived IS NULL)
  AND NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm 
    WHERE tm.user_id = u.user_uuid 
    AND tm.tenant_id = 6372
  );