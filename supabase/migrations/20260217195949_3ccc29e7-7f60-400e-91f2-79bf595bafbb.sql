UPDATE unicorn1.users u1
SET mapped_user_uuid = pu.user_uuid
FROM public.users pu
WHERE lower(pu.email) = lower(u1.email)
  AND u1.mapped_user_uuid IS NULL
  AND u1."Archived" = false
  AND u1."Disabled" = false;