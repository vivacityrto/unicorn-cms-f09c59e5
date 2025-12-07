-- Update user status to active
UPDATE public.tenant_members
SET status = 'active', updated_at = now()
WHERE user_id = '384cf51f-87f5-479b-a9c4-a2293be84e3a'
AND role::text LIKE 'SUPER_ADMIN%';