-- Fix: Align is_super_admin(p_user_id) to check unicorn_role instead of global_role
-- This resolves the issue where Super Admin users cannot access EOS data

-- Recreate the parameterized version to match the non-parameterized version
CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE user_uuid = p_user_id
      AND unicorn_role = 'Super Admin'
      AND (archived = false OR archived IS NULL)
  )
$function$;

-- Update Nova's tenant_id to Vivacity (6372) since she's a Super Admin
UPDATE public.users
SET tenant_id = 6372
WHERE user_uuid = '755d843d-8d93-4179-8bb8-50c61a6f21fe'
  AND tenant_id IS NULL;

-- Create tenant_members record for Nova if missing (role must be 'Admin' not 'admin')
INSERT INTO public.tenant_members (user_id, tenant_id, role, status, joined_at)
VALUES (
  '755d843d-8d93-4179-8bb8-50c61a6f21fe',
  6372,
  'Admin',
  'active',
  NOW()
)
ON CONFLICT (user_id, tenant_id) DO NOTHING;