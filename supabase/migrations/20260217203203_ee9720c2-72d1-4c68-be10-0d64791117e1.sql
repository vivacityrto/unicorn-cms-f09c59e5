-- Step 4: Sync archived/disabled status
UPDATE public.users pu
SET 
  archived = u1."Archived",
  disabled = u1."Disabled",
  updated_at = now()
FROM unicorn1.users u1
WHERE pu.user_uuid = u1.mapped_user_uuid
  AND u1."Discriminator" = 'Client'
  AND (pu.archived IS DISTINCT FROM u1."Archived" OR pu.disabled IS DISTINCT FROM u1."Disabled");