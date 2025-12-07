-- Remove deprecated token column from user_invitations table
-- The token_hash column is used instead for better security

ALTER TABLE public.user_invitations 
DROP COLUMN IF EXISTS token;

-- Add comment explaining the removal
COMMENT ON TABLE public.user_invitations IS 'User invitation records with secure token hashing. Tokens are hashed using SHA-256 and stored in token_hash column.';