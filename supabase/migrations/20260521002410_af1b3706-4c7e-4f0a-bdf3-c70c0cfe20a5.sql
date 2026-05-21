-- Promote Jenelle Watson, Dayan Kasturiratna, Emily Myatt to secondary_contact
-- trg_sync_primary_contact will auto-set secondary_contact = true.

UPDATE public.tenant_users
SET relationship_role = 'secondary_contact',
    role = 'parent'
WHERE (user_id = (SELECT user_uuid FROM public.users WHERE email = 'accounts@wattotraining.com.au') AND tenant_id = 7507)
   OR (user_id = (SELECT user_uuid FROM public.users WHERE email = 'dayan@australiancollege.edu.au')  AND tenant_id = 7512)
   OR (user_id = (SELECT user_uuid FROM public.users WHERE email = 'emily@petstylistacademy.com.au') AND tenant_id = 7542);

UPDATE public.users
SET unicorn_role = 'Admin',
    user_type    = 'Client Parent'
WHERE email IN (
  'accounts@wattotraining.com.au',
  'dayan@australiancollege.edu.au',
  'emily@petstylistacademy.com.au'
);

UPDATE public.tenant_members
SET role       = 'Admin',
    updated_at = now()
WHERE (user_id = (SELECT user_uuid FROM public.users WHERE email = 'accounts@wattotraining.com.au') AND tenant_id = 7507)
   OR (user_id = (SELECT user_uuid FROM public.users WHERE email = 'dayan@australiancollege.edu.au')  AND tenant_id = 7512)
   OR (user_id = (SELECT user_uuid FROM public.users WHERE email = 'emily@petstylistacademy.com.au') AND tenant_id = 7542);