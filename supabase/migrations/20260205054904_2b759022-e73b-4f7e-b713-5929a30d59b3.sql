
-- Archive the duplicate "Angela Connell" user (angela.connell@vivacity.com.au)
-- This user appears to be a duplicate of Angela Connell-Richards
UPDATE public.users
SET archived = true, disabled = true
WHERE user_uuid = '3e839ba0-427a-48ad-bdbf-5908292d7a6d';
