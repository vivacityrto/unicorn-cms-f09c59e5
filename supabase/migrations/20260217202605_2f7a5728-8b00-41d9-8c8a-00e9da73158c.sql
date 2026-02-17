UPDATE unicorn1.users u1
SET mapped_user_uuid = pu.user_uuid
FROM public.users pu
WHERE lower(pu.email) = lower(u1.email)
  AND u1.mapped_user_uuid IS NULL
  AND u1."Discriminator" = 'Client'
  AND u1.u2_tenant_id IS NOT NULL;